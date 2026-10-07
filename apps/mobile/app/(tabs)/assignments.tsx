import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorBanner, LoadingView, Screen, screenLayout } from '@/components/ui';
import { FF, fonts, theme } from '@/theme/brand';
import { mobileApi } from '@/lib/api';
import { requestMobileRefresh, subscribeToMobileRefresh } from '@/lib/mobile-refresh';
import { getClockLocation } from '@/lib/location';
import { officeWeekStart, permittedSelectedWeek } from '@/lib/workweek-preview';

function formatAssignmentDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function formatStartTime(value: string | null) {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function toLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function currentSaturday() {
  return new Date(`${officeWeekStart()}T12:00:00`);
}

function shiftDate(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function shortWorkDate(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type MobileAssignment = Awaited<ReturnType<typeof mobileApi.getAssignments>>[number];
type ActiveClockIn = Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>;

function InformationRow({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value?: string | null;
  highlighted?: boolean;
}) {
  const isAddress = label === 'Job Address';
  return (
    <View style={styles.informationRow}>
      {isAddress ? <Ionicons name="location-outline" size={17} color="#64748B" /> : <Text style={styles.informationLabel}>{label}:</Text>}
      <Text
        style={[styles.informationValue, isAddress && styles.addressValue, highlighted && styles.informationLink]}
        numberOfLines={2}
      >
        {value || '—'}
      </Text>
    </View>
  );
}

function AssignmentSiteCard({
  item,
  activeClockIn,
  onOpenDetails,
  onOpenJobOrder,
  onOpenTimesheet,
  onOpenClock,
  clockLoading,
  onCallForeman,
}: {
  item: MobileAssignment;
  activeClockIn: ActiveClockIn;
  onOpenDetails: () => void;
  onOpenJobOrder: () => void;
  onOpenTimesheet: () => void;
  onOpenClock: () => void;
  clockLoading: boolean;
  onCallForeman: () => void;
}) {
  const completed = ['COMPLETED', 'CANCELLED'].includes(item.status);
  const clockLabel = activeClockIn
    ? activeClockIn.assignmentId === item.id
      ? 'Clock Out'
      : 'View Clock'
    : 'Clock In';

  return (
    <View style={styles.assignmentCard}>
      <Pressable onPress={onOpenDetails} style={({ pressed }) => pressed && styles.cardPressed}>
        <View style={styles.assignmentHeader}>
          <View style={[styles.dateBadge, completed && styles.dateBadgeCompleted]}>
            <Text style={[styles.dateBadgeText, completed && styles.dateBadgeTextCompleted]}>{completed ? 'DONE' : item.assignedDate === toLocalIsoDate(new Date()) ? 'TODAY' : 'JOB SITE'}</Text>
          </View>
          <Text style={styles.assignmentDate}>{formatAssignmentDate(item.assignedDate)}</Text>
          {item.status === 'PENDING' ? <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>PENDING</Text></View> : null}
        </View>
      </Pressable>
      <InformationRow label="Company" value={item.customer?.companyName} />
      <InformationRow label="Job Name" value={item.jobSite?.name} />
      <InformationRow label="Job Address" value={item.jobSite?.address} />
      <InformationRow label="Foreman Name" value={item.jobSite?.foremanName} />
      <View style={styles.informationRow}>
        <Text style={styles.informationLabel}>Cell:</Text>
        {item.jobSite?.foremanPhone ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Call foreman at ${item.jobSite.foremanPhone}`}
            onPress={onCallForeman}
            style={({ pressed }) => [styles.cellLink, pressed && styles.cardPressed]}
          >
            <Ionicons name="call-outline" size={13} color="#2563EB" />
            <Text style={[styles.informationValue, styles.informationLink]} numberOfLines={1}>
              {item.jobSite.foremanPhone}
            </Text>
          </Pressable>
        ) : <Text style={styles.informationValue}>—</Text>}
      </View>
      <View style={styles.informationRow}>
        <Text style={styles.informationLabel}>Start:</Text>
        <View style={styles.startTimeValue}>
          <Ionicons name="time-outline" size={13} color="#64748B" />
          <Text style={styles.informationValue}>{formatStartTime(item.startTime) || '—'}</Text>
        </View>
      </View>
      {completed ? (
        <View style={[styles.clockAction, styles.clockActionCompleted]}>
          <Text style={styles.clockActionText}>Job Completed</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={clockLoading}
          onPress={onOpenClock}
          style={({ pressed }) => [
            styles.clockAction,
            !activeClockIn && styles.clockActionIn,
            activeClockIn?.assignmentId === item.id && styles.clockActionOut,
            pressed && styles.cardPressed,
          ]}
        >
          <Ionicons
            name={activeClockIn?.assignmentId === item.id ? 'stop-circle-outline' : 'log-in-outline'}
            size={17}
            color="#FFFFFF"
          />
          <Text style={styles.clockActionText}>{clockLoading ? 'Getting GPS…' : clockLabel}</Text>
        </Pressable>
      )}
      <View style={styles.secondaryActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View job order"
          disabled={!item.jobOrderId}
          onPress={onOpenJobOrder}
          style={({ pressed }) => [styles.secondaryAction, !item.jobOrderId && styles.secondaryActionDisabled, pressed && styles.cardPressed]}
        >
          <Ionicons name="document-text-outline" size={16} color={item.jobOrderId ? '#334155' : '#94A3B8'} />
          <Text style={[styles.secondaryActionText, !item.jobOrderId && styles.secondaryActionTextDisabled]}>View Job Order</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenTimesheet}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.cardPressed]}
        >
          <Ionicons name="calendar-outline" size={16} color="#334155" />
          <Text style={styles.secondaryActionText}>Time Sheet</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AssignmentsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getAssignments>>>([]);
  const [activeClockIn, setActiveClockIn] = useState<Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(() => currentSaturday());
  const [previousWeekEnabled, setPreviousWeekEnabled] = useState(false);
  const [nextWeekEnabled, setNextWeekEnabled] = useState(false);
  const [officeCurrentWeek, setOfficeCurrentWeek] = useState(officeWeekStart);
  const [previewDeadline, setPreviewDeadline] = useState<number | null>(null);
  const loadVersion = useRef(0);
  const lastOfficeWeek = useRef(officeWeekStart());
  const [clockingAssignmentId, setClockingAssignmentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const requestedAt = Date.now();
    setError('');
    try {
      const [assignments, active, features] = await Promise.all([
        mobileApi.getAssignments(),
        mobileApi.getActiveClockIn(),
        mobileApi.getMobileFeatures(),
      ]);
      if (version !== loadVersion.current) return;
      setItems(assignments);
      setActiveClockIn(active);
      setPreviousWeekEnabled(features.previousWeekEnabled);
      setNextWeekEnabled(features.nextWeekEnabled);
      const current = features.currentWeekStart ?? officeWeekStart();
      const lastCurrent = lastOfficeWeek.current;
      lastOfficeWeek.current = current;
      setOfficeCurrentWeek(current);
      setPreviewDeadline(features.previewExpiresAt && features.previewServerNow
        ? requestedAt + new Date(features.previewExpiresAt).getTime() - new Date(features.previewServerNow).getTime() : null);
      setWeekStart(selected => new Date(`${permittedSelectedWeek(toLocalIsoDate(selected), current, features.previousWeekEnabled, features.nextWeekEnabled, lastCurrent)}T12:00:00`));
    } catch (err) {
      if (version !== loadVersion.current) return;
      setNextWeekEnabled(false);
      setItems([]);
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => subscribeToMobileRefresh(load), [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    const interval = setInterval(() => void load(), 60_000);
    return () => { subscription.remove(); clearInterval(interval); };
  }, [load]);

  useEffect(() => {
    if (previewDeadline === null) return;
    const timeout = setTimeout(() => {
      ++loadVersion.current;
      const next = shiftDate(new Date(`${officeCurrentWeek}T12:00:00`), 7);
      setNextWeekEnabled(false);
      setOfficeCurrentWeek(toLocalIsoDate(next));
      setWeekStart(next);
      setItems([]);
      setPreviewDeadline(null);
      void load();
    }, Math.max(0, previewDeadline - Date.now()));
    return () => clearTimeout(timeout);
  }, [previewDeadline, officeCurrentWeek, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openTimesheet = (assignmentId: string, assignedDate: string) => {
    setError('');
    const selectedDate = new Date(`${assignedDate}T12:00:00`);
    selectedDate.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 1) % 7));
    router.push(
      `/manual-timesheet/${assignmentId}?weekStart=${encodeURIComponent(toLocalIsoDate(selectedDate))}` as never,
    );
  };

  const callForeman = async (phoneNumber?: string) => {
    const phone = phoneNumber?.trim().replace(/[^\d+]/g, '');
    if (!phone) return;
    setError('');
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      setError('Unable to open the phone dialer. Please verify the foreman’s phone number.');
    }
  };

  const openClock = async (assignment: MobileAssignment) => {
    setError('');
    if (activeClockIn) {
      router.push('/(tabs)/clock');
      return;
    }

    setClockingAssignmentId(assignment.id);
    try {
      if (assignment.status === 'PENDING') {
        await mobileApi.respondToAssignment(assignment.id, 'ACCEPTED');
      }
      const location = await getClockLocation();
      await mobileApi.clockIn({
        customerId: assignment.customerId,
        jobSiteId: assignment.jobSiteId,
        assignmentId: assignment.id,
        clockInLatitude: location.latitude,
        clockInLongitude: location.longitude,
        clockInLocationLabel: location.label,
      });
      await requestMobileRefresh();
      router.push('/(tabs)/clock');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clock in failed');
    } finally {
      setClockingAssignmentId(null);
    }
  };

  if (loading) return <LoadingView label="Loading assignments…" />;

  const weekEnd = shiftDate(weekStart, 6);
  const weekStartIso = toLocalIsoDate(weekStart);
  const weekEndIso = toLocalIsoDate(weekEnd);
  const visibleItems = items.filter((item) => {
    const assignmentEnd = item.endDate ?? item.assignedDate;
    return item.assignedDate <= weekEndIso && assignmentEnd >= weekStartIso;
  });
  const currentSaturdayForOffice = new Date(`${officeCurrentWeek}T12:00:00`);
  const currentWeekStartIso = officeCurrentWeek;
  const isCurrentWeek = weekStartIso === currentWeekStartIso;
  const isNextWeek = weekStartIso === toLocalIsoDate(shiftDate(currentSaturdayForOffice, 7));

  return (
    <Screen padded={false}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <View style={styles.weekControls}>
              <View style={[styles.clockStatusPill, activeClockIn ? styles.clockStatusPillIn : styles.clockStatusPillOut]}>
                <View style={[styles.clockStatusDot, activeClockIn ? styles.clockStatusDotIn : styles.clockStatusDotOut]} />
                <Text style={[styles.clockStatusPillText, activeClockIn ? styles.clockStatusPillTextIn : styles.clockStatusPillTextOut]} numberOfLines={1}>{activeClockIn ? 'YOU ARE CLOCKED IN' : 'YOU ARE CLOCKED OUT'}</Text>
              </View>
              <View style={styles.weekSummary}>
                <View style={styles.weekDateIcon}><Ionicons name="calendar-outline" size={16} color="#64748B" /></View>
                <View style={styles.weekSummaryCopy}>
                  <Text style={styles.weekSummaryEyebrow}>
                    {isCurrentWeek ? 'CURRENT WORK WEEK' : isNextWeek ? 'NEXT WEEK · PREVIEW' : 'PREVIOUS WORK WEEK'}
                  </Text>
                  <Text style={styles.weekSummaryDates} numberOfLines={1}>{shortWorkDate(weekStart)} – {shortWorkDate(weekEnd)}</Text>
                </View>
              </View>
              {previousWeekEnabled || nextWeekEnabled ? (
                <View style={styles.weekButtonRow}>
                  {previousWeekEnabled ? <Pressable
                    onPress={() => setWeekStart(shiftDate(currentSaturdayForOffice, -7))}
                    style={({ pressed }) => [
                      styles.weekButton,
                      !isCurrentWeek && !isNextWeek && styles.weekButtonActive,
                      pressed && styles.weekPressed,
                    ]}
                  >
                    <Ionicons name="chevron-back" size={15} color={!isCurrentWeek && !isNextWeek ? '#FFFFFF' : FF.primary} />
                    <Text style={[styles.weekButtonText, !isCurrentWeek && !isNextWeek && styles.weekButtonTextActive]}>
                      Previous Week
                    </Text>
                  </Pressable> : null}
                  <Pressable
                    onPress={() => setWeekStart(currentSaturdayForOffice)}
                    style={({ pressed }) => [
                      styles.weekButton,
                      isCurrentWeek && styles.weekButtonActive,
                      pressed && styles.weekPressed,
                    ]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={isCurrentWeek ? '#FFFFFF' : FF.primary} />
                    <Text style={[styles.weekButtonText, isCurrentWeek && styles.weekButtonTextActive]}>
                      This Week
                    </Text>
                  </Pressable>
                  {nextWeekEnabled ? (
                    <Pressable
                      onPress={() => setWeekStart(shiftDate(currentSaturdayForOffice, 7))}
                      style={({ pressed }) => [styles.weekButton, isNextWeek && styles.weekButtonActive, pressed && styles.weekPressed]}
                    >
                      <Text style={[styles.weekButtonText, isNextWeek && styles.weekButtonTextActive]}>Next Week</Text>
                      <Ionicons name="chevron-forward" size={15} color={isNextWeek ? '#FFFFFF' : FF.primary} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
            {nextWeekEnabled ? <View style={screenLayout.itemWrap}><Text style={{ color: FF.primary, fontSize: 12, lineHeight: 18, paddingBottom: 12 }}>Next-week preview is enabled for you. It expires Saturday at 12:00 AM Eastern Time. The previewed week then becomes This Week.</Text></View> : null}
            <View style={styles.pageHeading}>
              <Text style={styles.pageTitle}>My Assignments</Text>
              <Text style={styles.pageSubtitle}>Your active and upcoming job sites.</Text>
            </View>
            {error ? (
              <View style={screenLayout.itemWrap}>
                <ErrorBanner message={error} />
              </View>
            ) : null}
          </>
        }
        contentContainerStyle={screenLayout.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        ListEmptyComponent={
          <View style={screenLayout.itemWrap}>
            <EmptyState message="No assignments found for this work week." icon="📋" />
          </View>
        }
        renderItem={({ item }) => (
          <View style={screenLayout.itemWrap}>
            <AssignmentSiteCard
              item={item}
              activeClockIn={activeClockIn}
              onOpenDetails={() => router.push(`/assignments/${item.id}` as never)}
              onOpenJobOrder={() => item.jobOrderId && router.push(`/job-orders/${item.jobOrderId}` as never)}
              onOpenTimesheet={() => openTimesheet(item.id, item.assignedDate)}
              onOpenClock={() =>
                void openClock(item)
              }
              clockLoading={clockingAssignmentId === item.id}
              onCallForeman={() => void callForeman(item.jobSite?.foremanPhone)}
            />
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  assignmentCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  assignmentHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  dateBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: '#DCFCE7' },
  dateBadgeText: { fontFamily: fonts.bold, fontSize: 10, color: '#15803D' },
  dateBadgeCompleted: { backgroundColor: '#F1F5F9' },
  dateBadgeTextCompleted: { color: '#64748B' },
  assignmentDate: { fontFamily: fonts.medium, fontSize: 12, color: '#64748B' },
  pendingBadge: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FEF3C7' },
  pendingBadgeText: { fontFamily: fonts.bold, fontSize: 9, color: '#92400E' },
  informationRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  informationLabel: {
    width: 104,
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#64748B',
  },
  informationValue: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#0F172A',
  },
  addressValue: { marginLeft: 2 },
  informationLink: {
    fontFamily: fonts.bold,
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  cellLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  startTimeValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scheduleValue: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#0F172A',
  },
  secondaryActions: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 2, marginBottom: 12 },
  secondaryAction: { minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#FFFFFF' },
  secondaryActionDisabled: { backgroundColor: '#F8FAFC' },
  secondaryActionText: { fontFamily: fonts.semiBold, fontSize: 11, color: '#334155' },
  secondaryActionTextDisabled: { color: '#94A3B8' },
  clockAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  clockActionIn: {
    backgroundColor: '#16A34A',
  },
  clockActionOut: {
    backgroundColor: FF.red500,
  },
  clockActionCompleted: {
    backgroundColor: '#050505',
  },
  clockActionText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  cardPressed: {
    opacity: 0.78,
  },
  weekControls: {
    alignItems: 'stretch',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  weekSummary: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clockStatusPill: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12 },
  clockStatusPillIn: { backgroundColor: '#DCFCE7' },
  clockStatusPillOut: { backgroundColor: '#F1F5F9' },
  clockStatusDot: { width: 7, height: 7, borderRadius: 4 },
  clockStatusDotIn: { backgroundColor: '#16A34A' },
  clockStatusDotOut: { backgroundColor: '#94A3B8' },
  clockStatusPillText: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.15 },
  clockStatusPillTextIn: { color: '#15803D' },
  clockStatusPillTextOut: { color: '#64748B' },
  weekDateIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#F1F5F9' },
  weekSummaryCopy: { flex: 1 },
  weekButtonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 7,
  },
  weekButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  weekButtonActive: {
    borderColor: '#16A34A',
    backgroundColor: '#16A34A',
  },
  weekButtonText: {
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: '#15803D',
  },
  weekButtonTextActive: {
    color: '#FFFFFF',
  },
  weekPressed: {
    opacity: 0.75,
  },
  weekSummaryEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.7,
    color: '#15803D',
  },
  weekSummaryDates: {
    marginTop: 4,
    textAlign: 'left',
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: FF.text,
  },
  pageHeading: { marginHorizontal: 18, marginTop: 10, marginBottom: 12 },
  pageTitle: { fontFamily: fonts.bold, fontSize: 23, letterSpacing: -0.4, color: FF.text },
  pageSubtitle: { marginTop: 3, fontFamily: fonts.regular, fontSize: 13, color: '#64748B' },
});
