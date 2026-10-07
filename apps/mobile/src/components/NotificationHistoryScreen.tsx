import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, ErrorBanner, LoadingView, Screen } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';
import { FF, fonts } from '@/theme/brand';

type Notice = Awaited<ReturnType<typeof mobileApi.getNotifications>>[number];
type NoticeFilter = 'ALL' | 'ASSIGNMENTS' | 'SYSTEM';
type NoticeSort = 'NEWEST' | 'OLDEST';
const timestamp = (value: string) => new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function NotificationHistoryScreen({ standalone = false }: { standalone?: boolean }) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { notificationId } = useLocalSearchParams<{ notificationId?: string }>();
  const openedId = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const moreBusy = useRef(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [filter, setFilter] = useState<NoticeFilter>('ALL');
  const [sort, setSort] = useState<NoticeSort>('NEWEST');
  const [activeClockIn, setActiveClockIn] = useState<Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (standalone) return;
    navigation.setOptions({ headerShown: !selected });
    return () => navigation.setOptions({ headerShown: true });
  }, [navigation, selected, standalone]);

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
      const [rows, clockStatus] = await Promise.all([
        mobileApi.getNotifications(0),
        mobileApi.getActiveClockIn().then((status) => ({ status })).catch(() => ({ status: null })),
      ]);
      if (version !== generation.current) return;
      setActiveClockIn(clockStatus.status);
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
  if (selected && !standalone) {
    return <Screen padded={false}>
      <View style={[styles.detail, { paddingTop: insets.top }]}>
        <View style={styles.navigation}><Pressable disabled={busy} onPress={() => setSelected(null)} accessibilityRole="button" style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Ionicons name="arrow-back" size={20} color={FF.text} /><Text style={styles.backText}>Notifications</Text></Pressable><Text style={styles.muted}>MESSAGE</Text></View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <View style={styles.messageCard}>
            <View style={styles.messageHeader}><View style={styles.heroIcon}><Ionicons name="notifications-outline" size={24} color={FF.primary} /></View><View style={styles.badge}><Text style={styles.badgeText}>{selected.readAt ? 'Read' : 'Unread'}</Text></View></View>
            <Text selectable style={styles.detailTitle}>{selected.title}</Text>
            <View style={styles.row}><Ionicons name="time-outline" size={15} color="#94a3b8" /><Text style={styles.muted}>{timestamp(selected.createdAt)} · Local time</Text></View>
            <View style={styles.divider} />
            <Text selectable style={styles.fullMessage}>{selected.message}</Text>
          </View>
          {error ? <ErrorBanner message={error} /> : null}
          {confirmDelete ? <View style={styles.confirm}><Text style={styles.confirmText}>Delete this notification from your history? This cannot be undone.</Text><Pressable disabled={busy} onPress={() => void remove()} style={[styles.button, styles.deleteConfirmButton]}><Text style={styles.danger}>{busy ? 'Deleting…' : 'Yes, delete notification'}</Text></Pressable><Pressable disabled={busy} onPress={() => setConfirmDelete(false)} style={styles.button}><Text style={styles.cancelText}>Cancel</Text></Pressable></View>
            : <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Ionicons name="trash-outline" size={18} color="#DC2626" /><Text style={styles.danger}>Delete notification</Text></Pressable>}
        </ScrollView>
      </View>
    </Screen>;
  }
  const unreadCount = items.filter((item) => !item.readAt).length;
  const visibleItems = items.filter((item) => {
    if (filter === 'ALL') return true;
    const isAssignment = ['ASSIGNMENT_NOTICE', 'JOB_ORDER'].includes(item.type.toUpperCase());
    return filter === 'ASSIGNMENTS' ? isAssignment : !isAssignment;
  }).sort((a, b) => {
    const dateOrder = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sort === 'NEWEST' ? -dateOrder : dateOrder;
  });
  return <Screen padded={false}>
    {standalone ? <Pressable style={styles.button} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text>← Back</Text></Pressable> : null}
    <FlatList
      data={visibleItems} keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setError(''); void load(); }} />}
      ListHeaderComponent={<View style={styles.heading}>
        <View style={[styles.clockStatus, activeClockIn ? styles.clockStatusIn : styles.clockStatusOut]}>
          <Text style={styles.clockStatusText}>{activeClockIn ? 'YOU ARE CLOCKED IN' : 'YOU ARE CLOCKED OUT'}</Text>
        </View>
        <Text style={styles.headingText}>Notifications</Text>
        <Text style={styles.subtitle}>Your latest updates, all in one place.</Text>
        <View style={styles.filterRow}>
          {([
            ['ALL', `All${unreadCount ? ` (${unreadCount} unread)` : ''}`],
            ['ASSIGNMENTS', 'Assignments'],
            ['SYSTEM', 'System'],
          ] as const).map(([value, label]) => {
            const active = filter === value;
            return <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Show ${label} notifications`} accessibilityState={{ selected: active }} onPress={() => setFilter(value)} style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>NOTIFICATION HISTORY</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sort ${sort === 'NEWEST' ? 'oldest first' : 'latest first'}`} onPress={() => setSort((current) => current === 'NEWEST' ? 'OLDEST' : 'NEWEST')} style={styles.sortButton}>
            <Text style={styles.sortText}>{sort === 'NEWEST' ? 'Latest first' : 'Oldest first'}</Text>
            <Ionicons name="chevron-down" size={14} color="#64748b" />
          </Pressable>
        </View>
        {error && !selected ? <ErrorBanner message={error} /> : null}
      </View>}
      ListEmptyComponent={<EmptyState icon="🔔" message={items.length ? 'No notifications in this category.' : 'No notifications yet.'} />}
      ListFooterComponent={hasMore ? <Pressable disabled={moreLoading} onPress={() => void loadMore()} style={styles.button}><Text>{moreLoading ? 'Loading…' : 'Load older notifications'}</Text></Pressable> : null}
      renderItem={({ item }) => {
        const assignment = ['ASSIGNMENT_NOTICE', 'JOB_ORDER'].includes(item.type.toUpperCase());
        const safety = item.type.toUpperCase() === 'SAFETY';
        const iconName = assignment ? 'briefcase-outline' : safety ? 'shield-checkmark-outline' : 'notifications-outline';
        const accentColor = assignment ? '#D97706' : safety ? '#16A34A' : '#64748B';
        return <Pressable onPress={() => void open(item)} accessibilityRole="button" accessibilityLabel={`${item.readAt ? 'Read' : 'Unread'}: ${item.title}`} style={({ pressed }) => [styles.card, item.readAt ? styles.readCard : styles.unreadCard, pressed && styles.pressed]}>
        <View style={styles.row}><View style={[styles.noticeIcon, { backgroundColor: item.readAt ? '#E2E8F0' : safety ? '#DCFCE7' : assignment ? '#FEF3C7' : '#F1F5F9' }]}><Ionicons name={iconName} size={18} color={item.readAt ? '#94A3B8' : accentColor} /></View><Text numberOfLines={2} style={[styles.title, item.readAt ? styles.readTitle : styles.bold]}>{item.title}</Text>{!item.readAt ? <View style={styles.badgeUnread}><Text style={styles.badgeTextUnread}>Unread</Text></View> : null}</View>
        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.preview}>{item.message}</Text>
        <View style={styles.metadata}><Text style={styles.date}>{timestamp(item.createdAt)}</Text>{item.readAt ? <Text style={styles.readLabel}>Read</Text> : null}<Ionicons name="chevron-forward" size={14} color="#94a3b8" /></View>
      </Pressable>;
      }}
    />
    <Modal visible={standalone && Boolean(selected)} animationType="slide" onRequestClose={() => { if (!busy) setSelected(null); }}>
      <View style={[styles.detail, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.navigation}><Pressable disabled={busy} onPress={() => setSelected(null)} accessibilityRole="button" style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Ionicons name="arrow-back" size={20} color={FF.text} /><Text style={styles.backText}>Notifications</Text></Pressable><Text style={styles.muted}>MESSAGE</Text></View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <View style={styles.messageCard}>
          <View style={styles.messageHeader}><View style={styles.heroIcon}><Ionicons name="notifications-outline" size={24} color={FF.primary} /></View><View style={styles.badge}><Text style={styles.badgeText}>{selected?.readAt ? 'Read' : 'Unread'}</Text></View></View>
          <Text selectable style={styles.detailTitle}>{selected?.title}</Text>
          <View style={styles.row}><Ionicons name="time-outline" size={15} color="#94a3b8" /><Text style={styles.muted}>{selected ? timestamp(selected.createdAt) : ''} · Local time</Text></View>
          <View style={styles.divider} />
          <Text selectable style={styles.fullMessage}>{selected?.message}</Text>
          </View>
          {error ? <ErrorBanner message={error} /> : null}
          {confirmDelete ? <View style={styles.confirm}><Text style={styles.confirmText}>Delete this notification from your history? This cannot be undone.</Text><Pressable disabled={busy} onPress={() => void remove()} style={[styles.button, styles.deleteConfirmButton]}><Text style={styles.danger}>{busy ? 'Deleting…' : 'Yes, delete notification'}</Text></Pressable><Pressable disabled={busy} onPress={() => setConfirmDelete(false)} style={styles.button}><Text style={styles.cancelText}>Cancel</Text></Pressable></View>
            : <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Ionicons name="trash-outline" size={18} color="#DC2626" /><Text style={styles.danger}>Delete notification</Text></Pressable>}
        </ScrollView>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  heading: { gap: 8, marginBottom: 4, paddingTop: 4 }, headingText: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7, color: '#0f172a' },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#e8efff', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: '#2563eb', marginTop: 6 },
  subtitle: { color: '#64748b', fontSize: 14, lineHeight: 21 },
  clockStatus: { alignSelf: 'stretch', minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  clockStatusIn: { backgroundColor: '#DCFCE7' },
  clockStatusOut: { backgroundColor: '#E2E8F0' },
  clockStatusDot: { width: 7, height: 7, borderRadius: 4 },
  clockStatusDotIn: { backgroundColor: '#16A34A' },
  clockStatusDotOut: { backgroundColor: '#94A3B8' },
  clockStatusText: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, textAlign: 'center', color: '#000000', letterSpacing: 0.3 },
  clockStatusTextIn: { color: '#15803D' },
  clockStatusTextOut: { color: '#475569' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, marginBottom: 2 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7, marginBottom: 2 },
  filterChip: { minHeight: 33, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#dbe3ed', backgroundColor: '#fff' },
  filterChipActive: { borderColor: '#16a34a', backgroundColor: '#16a34a' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: '#fff' },
  sectionLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  sortButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5 },
  sortText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  card: { backgroundColor: '#fff', borderColor: '#e5eaf2', borderWidth: 1, borderRadius: 16, padding: 14, gap: 9, shadowColor: '#334155', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 12, elevation: 1 },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: '#3B82F6', borderColor: '#dbe5f1' },
  readCard: { backgroundColor: '#EEF0F2', borderColor: '#E2E5E9', shadowOpacity: 0, elevation: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18, color: '#334155' }, bold: { fontWeight: '700', color: '#0f172a' }, readTitle: { color: '#64748b' },
  preview: { color: '#64748b', fontSize: 12, lineHeight: 18 }, muted: { color: '#64748b', fontSize: 11, lineHeight: 17, flexShrink: 1 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  date: { flex: 1, fontSize: 11, lineHeight: 17, color: '#64748b' },
  badge: { backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  badgeUnread: { backgroundColor: '#2563EB', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }, badgeTextUnread: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  readLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8' },
  pressed: { opacity: 0.72 },
  button: { padding: 15, alignItems: 'center', borderRadius: 10, backgroundColor: '#f1f5f9', marginVertical: 6 },
  detail: { flex: 1, backgroundColor: FF.bg },
  navigation: { width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 62, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: FF.borderInput, backgroundColor: FF.card },
  backButton: { minHeight: 44, flexDirection: 'row', gap: 9, alignItems: 'center', paddingRight: 16 }, backText: { color: FF.text, fontFamily: fonts.semiBold, fontSize: 15 },
  detailContent: { gap: 16, padding: 16, paddingTop: 16, paddingBottom: 30, width: '100%', maxWidth: 720, alignSelf: 'center' },
  messageCard: { padding: 20, gap: 15, backgroundColor: FF.card, borderRadius: 20, borderWidth: 1, borderColor: FF.borderInput, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  messageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTitle: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 31, letterSpacing: -0.4, color: FF.text },
  divider: { height: 1, backgroundColor: FF.border, marginVertical: 2 },
  fullMessage: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 25, color: FF.textSecondary },
  deleteButton: { minHeight: 48, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  danger: { color: '#B91C1C', fontFamily: fonts.semiBold, fontSize: 13 }, confirm: { gap: 8, padding: 16, backgroundColor: '#FEF2F2', borderRadius: 18, borderWidth: 1, borderColor: '#FECACA' },
  confirmText: { color: FF.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  deleteConfirmButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FECACA' },
  cancelText: { color: FF.text, fontFamily: fonts.semiBold, fontSize: 13 },
});
