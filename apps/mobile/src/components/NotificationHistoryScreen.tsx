import { useCallback, useRef, useState } from 'react';
import { AppState, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, ErrorBanner, LoadingView, Screen } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';

type Notice = Awaited<ReturnType<typeof mobileApi.getNotifications>>[number];
const timestamp = (value: string) => new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function NotificationHistoryScreen({ standalone = false }: { standalone?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notificationId } = useLocalSearchParams<{ notificationId?: string }>();
  const openedId = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const moreBusy = useRef(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = useCallback(async (item: Notice) => {
    setSelected(item);
    setConfirmDelete(false);
    setError('');
    if (!item.readAt) {
      try {
        const updated = await mobileApi.markNotificationRead(item.id);
        setItems((current) => current.map((row) => row.id === item.id ? updated : row));
        setSelected((current) => current?.id === item.id ? updated : current);
      } catch { setError('The message opened, but its read status could not be saved. Please try again.'); }
    }
  }, []);

  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const rows = await mobileApi.getNotifications(0);
      if (version !== generation.current) return;
      setItems(rows); setPage(0); setHasMore(rows.length === 50);
      if (notificationId && openedId.current !== notificationId) {
        const target = rows.find((row) => row.id === notificationId)
          ?? await mobileApi.getNotification(notificationId);
        if (version !== generation.current) return;
        openedId.current = notificationId;
        if (target) await open(target);
        else setError('This notification is no longer available.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load notifications'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [notificationId, open]);

  useFocusEffect(useCallback(() => {
    void load();
    const unsubscribe = subscribeToMobileRefresh(load);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    return () => { unsubscribe(); appState.remove(); };
  }, [load]));

  const loadMore = async () => {
    if (!hasMore || moreBusy.current || refreshing) return;
    moreBusy.current = true;
    const version = generation.current;
    setMoreLoading(true);
    try {
      const rows = await mobileApi.getNotifications(page + 1);
      if (version !== generation.current) return;
      setItems((current) => Array.from(new Map([...current, ...rows].map((row) => [row.id, row])).values()));
      setPage((current) => current + 1); setHasMore(rows.length === 50);
    } catch { setError('Could not load older notifications. Please try again.'); }
    finally { moreBusy.current = false; setMoreLoading(false); }
  };

  const remove = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      await mobileApi.deleteNotification(selected.id);
      generation.current += 1;
      setItems((current) => current.filter((row) => row.id !== selected.id));
      setSelected(null); setConfirmDelete(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete notification'); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingView label="Loading notifications…" />;
  return <Screen padded={false}>
    {standalone ? <Pressable style={styles.button} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text>← Back</Text></Pressable> : null}
    <FlatList
      data={items} keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setError(''); void load(); }} />}
      ListHeaderComponent={<View style={styles.heading}>
        <View style={styles.heroIcon}><Ionicons name="notifications" size={26} color="#2563eb" /></View>
        <Text style={styles.eyebrow}>YOUR INBOX</Text>
        <Text style={styles.headingText}>Notifications</Text>
        <Text style={styles.subtitle}>Your latest updates, all in one place.</Text>
        <View style={styles.sectionRow}><Text style={styles.sectionLabel}>NOTIFICATION HISTORY</Text><Text style={styles.muted}>Latest first</Text></View>
        {error && !selected ? <ErrorBanner message={error} /> : null}
      </View>}
      ListEmptyComponent={<EmptyState icon="🔔" message="No notifications yet." />}
      ListFooterComponent={hasMore ? <Pressable disabled={moreLoading} onPress={() => void loadMore()} style={styles.button}><Text>{moreLoading ? 'Loading…' : 'Load older notifications'}</Text></Pressable> : null}
      renderItem={({ item }) => <Pressable onPress={() => void open(item)} accessibilityRole="button" accessibilityLabel={`${item.readAt ? 'Read' : 'Unread'}: ${item.title}`} style={({ pressed }) => [styles.card, !item.readAt && styles.unread, pressed && styles.pressed]}>
        <View style={styles.row}><View style={[styles.noticeIcon, !item.readAt && styles.noticeIconUnread]}><Ionicons name="notifications-outline" size={19} color={item.readAt ? '#64748b' : '#2563eb'} /></View><Text numberOfLines={2} style={[styles.title, !item.readAt && styles.bold]}>{item.title}</Text>{!item.readAt ? <View style={styles.dot} /> : null}</View>
        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.preview}>{item.message}</Text>
        <View style={styles.metadata}><Text style={styles.date}>{timestamp(item.createdAt)}</Text><View style={[styles.badge, !item.readAt && styles.badgeUnread]}><Text style={[styles.badgeText, !item.readAt && styles.badgeTextUnread]}>{item.readAt ? 'Read' : 'Unread'}</Text></View><Ionicons name="chevron-forward" size={14} color="#94a3b8" /></View>
      </Pressable>}
    />
    <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => { if (!busy) setSelected(null); }}>
      <View style={[styles.detail, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.navigation}><Pressable disabled={busy} onPress={() => setSelected(null)} accessibilityRole="button" style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Ionicons name="arrow-back" size={20} color="#334155" /><Text style={styles.backText}>Notifications</Text></Pressable><Text style={styles.muted}>MESSAGE</Text></View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <View style={styles.messageCard}>
          <View style={styles.messageHeader}><View style={styles.heroIcon}><Ionicons name="notifications-outline" size={26} color="#2563eb" /></View><View style={styles.badge}><Text style={styles.badgeText}>{selected?.readAt ? 'Read' : 'Unread'}</Text></View></View>
          <Text selectable style={styles.detailTitle}>{selected?.title}</Text>
          <View style={styles.row}><Ionicons name="time-outline" size={15} color="#94a3b8" /><Text style={styles.muted}>{selected ? timestamp(selected.createdAt) : ''} · Local time</Text></View>
          <View style={styles.divider} />
          <Text selectable style={styles.fullMessage}>{selected?.message}</Text>
          </View>
          {error ? <ErrorBanner message={error} /> : null}
          {confirmDelete ? <View style={styles.confirm}><Text>Delete this notification from your history? This cannot be undone.</Text><Pressable disabled={busy} onPress={() => void remove()} style={styles.button}><Text style={styles.danger}>{busy ? 'Deleting…' : 'Yes, delete notification'}</Text></Pressable><Pressable disabled={busy} onPress={() => setConfirmDelete(false)} style={styles.button}><Text>Cancel</Text></Pressable></View>
            : <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Ionicons name="trash-outline" size={18} color="#be123c" /><Text style={styles.danger}>Delete notification</Text></Pressable>}
        </ScrollView>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { padding: 20, paddingBottom: 40, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  heading: { gap: 8, marginBottom: 4, paddingTop: 8 }, headingText: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, color: '#0f172a' },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#e8efff', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: '#2563eb', marginTop: 6 },
  subtitle: { color: '#64748b', fontSize: 14, lineHeight: 21 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 24, marginBottom: 6 },
  sectionLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  card: { backgroundColor: '#fff', borderColor: '#e5eaf2', borderWidth: 1, borderRadius: 20, padding: 18, gap: 12, shadowColor: '#334155', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 12, elevation: 1 },
  unread: { backgroundColor: '#f0f5ff', borderColor: '#c7d9fb' }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  noticeIconUnread: { backgroundColor: '#dfeaff' },
  title: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 21, color: '#334155' }, bold: { fontWeight: '700', color: '#0f172a' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2563eb' },
  preview: { color: '#64748b', fontSize: 14, lineHeight: 22 }, muted: { color: '#64748b', fontSize: 11, lineHeight: 17, flexShrink: 1 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  date: { flex: 1, fontSize: 11, lineHeight: 17, color: '#64748b' },
  badge: { backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  badgeUnread: { backgroundColor: '#dfeaff' }, badgeText: { fontSize: 10, fontWeight: '600', color: '#64748b' }, badgeTextUnread: { color: '#1d4ed8' },
  pressed: { opacity: 0.72 },
  button: { padding: 15, alignItems: 'center', borderRadius: 10, backgroundColor: '#f1f5f9', marginVertical: 6 },
  detail: { flex: 1, backgroundColor: '#f6f8fc' },
  navigation: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center', paddingRight: 16 }, backText: { color: '#334155', fontWeight: '600', fontSize: 14 },
  detailContent: { gap: 20, padding: 20, paddingTop: 4, paddingBottom: 30, width: '100%', maxWidth: 720, alignSelf: 'center' },
  messageCard: { padding: 24, gap: 16, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#e5eaf2' },
  messageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTitle: { fontSize: 26, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, color: '#0f172a' },
  divider: { height: 1, backgroundColor: '#edf1f7', marginVertical: 4 },
  fullMessage: { fontSize: 16, lineHeight: 28, color: '#334155' },
  deleteButton: { minHeight: 50, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#ffe4e6' },
  danger: { color: '#be123c', fontWeight: '600', fontSize: 13 }, confirm: { gap: 8, padding: 20, backgroundColor: '#fff1f2', borderRadius: 18 },
});
