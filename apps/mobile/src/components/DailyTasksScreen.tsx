import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, EmptyState, ErrorBanner, ImageBanner, ListCard, ModalSheet, Screen, screenLayout } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { mobileApi, type MessageContact } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { FF, fonts, theme } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';

type Task = Awaited<ReturnType<typeof mobileApi.getDailyTasks>>[number];
const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'] as const;
const today = () => new Date().toISOString().slice(0, 10);

export function DailyTasksScreen() {
  const { user } = useAuth();
  const supervisor = user?.role === 'SUPERVISOR';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [contact, setContact] = useState<MessageContact | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskDate, setTaskDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [taskRows, contactRows] = await Promise.all([
        mobileApi.getDailyTasks(),
        supervisor ? mobileApi.getMessageContacts() : Promise.resolve([]),
      ]);
      setTasks(taskRows); setContacts(contactRows);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load tasks'); }
  }, [supervisor]);
  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  useEffect(() => {
    const channel = supabase.channel(`daily-tasks:${user?.id ?? 'mobile'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_tasks' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const create = async () => {
    if (!contact || !title.trim()) return;
    setSaving(true); setError('');
    try {
      await mobileApi.createDailyTask({ workerUserId: contact.contactUserId, jobSiteId: contact.jobSiteId, taskDate, title, description });
      setCreating(false); setContact(null); setTitle(''); setDescription(''); setTaskDate(today()); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create task'); }
    finally { setSaving(false); }
  };

  const update = async (status: string) => {
    if (!selected) return;
    setSaving(true); setError('');
    try { await mobileApi.updateDailyTaskStatus(selected.id, status, notes); setSelected(null); setNotes(''); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update task'); }
    finally { setSaving(false); }
  };

  return <Screen padded={false}>
    <FlatList data={tasks} keyExtractor={(item) => item.id} contentContainerStyle={screenLayout.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true);await load();setRefreshing(false);}} tintColor={FF.primary}/>} 
      ListHeaderComponent={<><ImageBanner variant="full" source={IMAGERY.heroWorkforce} title="Daily Tasks" subtitle={supervisor ? 'Assign and monitor site work' : 'Update today’s work status'} /><View style={screenLayout.listSpacer}/>{supervisor?<View style={screenLayout.itemWrap}><Button label="Create Daily Task" icon="add-circle-outline" onPress={()=>setCreating(true)}/></View>:null}{error?<View style={[screenLayout.itemWrap,styles.error]}><ErrorBanner message={error}/></View>:null}{loading?<Text style={styles.loading}>Loading tasks…</Text>:null}</>}
      ListEmptyComponent={!loading?<View style={screenLayout.itemWrap}><EmptyState icon="✅" message={supervisor?'No tasks have been assigned yet.':'No daily tasks assigned.'}/></View>:null}
      renderItem={({item})=><View style={screenLayout.itemWrap}><ListCard size="comfortable" icon="checkbox-outline" iconAccent={item.status==='COMPLETED'?'green':item.status==='BLOCKED'?'rose':'blue'} title={item.title} subtitle={supervisor?`${item.employee?.name ?? 'Worker'} · ${item.description ?? item.jobSite?.name}`:item.description ?? item.jobSite?.name} meta={`${item.taskDate} · ${item.jobSite?.name ?? ''}`} status={item.status} onPress={()=>{setSelected(item);setNotes(item.completionNotes??'');}}/></View>}/>

    <ModalSheet visible={creating} title="Create daily task" onClose={()=>setCreating(false)} footer={<Button label="Assign Task" loading={saving} disabled={!contact||!title.trim()} onPress={()=>void create()}/>}>
      <Text style={styles.label}>Worker and job site</Text>
      {contacts.map(c=><Pressable key={`${c.contactUserId}:${c.jobSiteId}`} onPress={()=>setContact(c)} style={[styles.choice,contact?.contactUserId===c.contactUserId&&contact.jobSiteId===c.jobSiteId&&styles.choiceSelected]}><Text style={styles.choiceTitle}>{c.contactName}</Text><Text style={styles.choiceSub}>{c.jobSiteName}</Text></Pressable>)}
      {!contacts.length?<Text style={styles.help}>Assign workers and this supervisor to the same active job site first.</Text>:null}
      <Text style={styles.label}>Task date (YYYY-MM-DD)</Text><TextInput value={taskDate} onChangeText={setTaskDate} style={styles.input}/>
      <Text style={styles.label}>Title</Text><TextInput value={title} onChangeText={setTitle} maxLength={160} style={styles.input} placeholder="Task title"/>
      <Text style={styles.label}>Instructions</Text><TextInput value={description} onChangeText={setDescription} multiline style={[styles.input,styles.multiline]} placeholder="Optional instructions"/>
    </ModalSheet>

    <ModalSheet visible={!!selected} title={selected?.title ?? ''} onClose={()=>setSelected(null)} footer={supervisor?<Button label="Close" variant="ghost" onPress={()=>setSelected(null)}/>:undefined}>
      <Text style={styles.detail}>{selected?.description || 'No additional instructions.'}</Text>
      <Text style={styles.help}>{selected?.employee?.name ? `${selected.employee.name} · ` : ''}{selected?.jobSite?.name} · {selected?.taskDate}</Text>
      {!supervisor?<><Text style={styles.label}>Progress notes</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input,styles.multiline]} placeholder="Add an update or completion note"/>{STATUSES.map(status=><Button key={status} label={status.replaceAll('_',' ')} loading={saving&&selected?.status!==status} disabled={saving} variant={status==='BLOCKED'?'ghostDanger':status===selected?.status?'ghost':'primary'} onPress={()=>void update(status)}/>)}</>:null}
    </ModalSheet>
  </Screen>;
}

const styles=StyleSheet.create({loading:{fontFamily:fonts.medium,color:FF.textMuted,textAlign:'center',padding:24},error:{marginTop:12},label:{fontFamily:fonts.semiBold,fontSize:12,color:FF.textSecondary,marginTop:14,marginBottom:6,textTransform:'uppercase'},input:{borderWidth:1,borderColor:theme.colors.borderSoft,borderRadius:14,paddingHorizontal:13,paddingVertical:11,fontFamily:fonts.regular,color:FF.text,backgroundColor:FF.bg},multiline:{minHeight:82,textAlignVertical:'top'},choice:{borderWidth:1,borderColor:theme.colors.borderSoft,borderRadius:14,padding:12,marginBottom:8},choiceSelected:{borderColor:FF.primary,backgroundColor:FF.blue50},choiceTitle:{fontFamily:fonts.semiBold,color:FF.text},choiceSub:{fontFamily:fonts.regular,fontSize:12,color:FF.textMuted,marginTop:3},help:{fontFamily:fonts.regular,fontSize:12,color:FF.textMuted,lineHeight:18,marginTop:8},detail:{fontFamily:fonts.regular,fontSize:15,color:FF.text,lineHeight:23}});
