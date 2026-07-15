import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ErrorBanner, LoadingView, Screen, StackAppHeader } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { mobileApi, type ConversationMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { FF, fonts, theme } from '@/theme/brand';

export default function ConversationScreen() {
  const { id, name, site } = useLocalSearchParams<{ id: string; name?: string; site?: string }>();
  const { user } = useAuth();
  const listRef = useRef<FlatList<ConversationMessage>>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setMessages(await mobileApi.getConversationMessages(id));
      await mobileApi.markConversationRead(id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load messages'); }
  }, [id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`conversation:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, load]);

  const send = async () => {
    if (!id || !draft.trim() || sending) return;
    const body = draft;
    setDraft(''); setSending(true); setError('');
    try { await mobileApi.sendConversationMessage(id, body); await load(); }
    catch (err) { setDraft(body); setError(err instanceof Error ? err.message : 'Could not send message'); }
    finally { setSending(false); }
  };

  if (loading) return <LoadingView label="Loading conversation…" />;
  return (
    <Screen padded={false}>
      <StackAppHeader />
      <View style={styles.siteBar}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={FF.primary} />
        <Text style={styles.siteText}>{name ?? 'Conversation'} · {site ?? 'Job site'}</Text>
      </View>
      {error ? <View style={styles.error}><ErrorBanner message={error} /></View> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList ref={listRef} data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messages}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello.</Text>}
          renderItem={({ item }) => {
            const mine = item.senderUserId === user?.id;
            return <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={[styles.body, mine && styles.mineText]}>{item.body}</Text><Text style={[styles.time, mine && styles.mineTime]}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View>;
          }} />
        <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Type a message…" multiline maxLength={2000} style={styles.input} /><Pressable onPress={() => void send()} disabled={!draft.trim() || sending} style={[styles.send, (!draft.trim() || sending) && styles.disabled]}><Ionicons name="send" size={20} color="#fff" /></Pressable></View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex:{flex:1}, siteBar:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,paddingVertical:9,backgroundColor:FF.blue50,borderBottomWidth:1,borderBottomColor:theme.colors.infoBorder},siteText:{fontFamily:fonts.medium,fontSize:12,color:FF.primary},
  error:{paddingHorizontal:theme.spacing.screen,paddingTop:12},messages:{padding:theme.spacing.screen,gap:8,flexGrow:1,justifyContent:'flex-end'},empty:{fontFamily:fonts.regular,color:theme.colors.textMuted,textAlign:'center',marginVertical:40},
  bubble:{maxWidth:'82%',paddingHorizontal:14,paddingVertical:10,borderRadius:18},mine:{alignSelf:'flex-end',backgroundColor:FF.primary,borderBottomRightRadius:5},theirs:{alignSelf:'flex-start',backgroundColor:theme.colors.surfaceMuted,borderBottomLeftRadius:5},body:{fontFamily:fonts.regular,fontSize:14,lineHeight:20,color:FF.text},mineText:{color:'#fff'},time:{fontFamily:fonts.regular,fontSize:9,color:theme.colors.textMuted,marginTop:4,textAlign:'right'},mineTime:{color:'#DBEAFE'},
  composer:{flexDirection:'row',alignItems:'flex-end',gap:10,padding:12,borderTopWidth:1,borderTopColor:theme.colors.borderSoft,backgroundColor:theme.colors.surface},input:{flex:1,maxHeight:110,minHeight:44,paddingHorizontal:14,paddingVertical:11,borderRadius:22,borderWidth:1,borderColor:theme.colors.borderSoft,fontFamily:fonts.regular,color:FF.text,backgroundColor:FF.bg},send:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:FF.primary},disabled:{opacity:.45},
});
