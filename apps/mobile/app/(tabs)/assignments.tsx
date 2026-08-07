import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorBanner, ImageBanner, LoadingView, Screen, screenLayout } from '@/components/ui';
import { FF, fonts, theme } from '@/theme/brand';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';
import { IMAGERY } from '@/constants/imagery';

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
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  today.setDate(today.getDate() - ((today.getDay() + 1) % 7));
  return today;
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
  return (
    <View style={styles.informationRow}>
      <Text style={styles.informationLabel}>{label}:</Text>
      <Text
        style={[styles.informationValue, highlighted && styles.informationLink]}
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
  onOpenTimesheet,
  onOpenClock,
  onCallForeman,
}: {
  item: MobileAssignment;
  activeClockIn: ActiveClockIn;
  onOpenDetails: () => void;
  onOpenTimesheet: () => void;
  onOpenClock: () => void;
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
          <Text style={styles.assignmentHeaderText} numberOfLines={1} adjustsFontSizeToFit>
            {completed ? 'JOB COMPLETED' : "TODAY'S JOB SITE INFORMATION"} - {formatAssignmentDate(item.assignedDate)}
          </Text>
        </View>
      </Pressable>
      <InformationRow label="Company Name" value={item.customer?.companyName} />
      <InformationRow label="Job Name" value={item.jobSite?.name} />
      <InformationRow label="Job Address" value={item.jobSite?.address} />
      <InformationRow label="Foreman Name" value={item.jobSite?.foremanName} />
      <View style={styles.scheduleRow}>
        {item.jobSite?.foremanPhone ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Call foreman at ${item.jobSite.foremanPhone}`}
            onPress={onCallForeman}
            style={({ pressed }) => [styles.scheduleCell, pressed && styles.cardPressed]}
          >
            <Text style={styles.scheduleLabel}>Foreman Cell:</Text>
            <Text style={[styles.scheduleValue, styles.informationLink]} numberOfLines={1}>
              {item.jobSite.foremanPhone}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.scheduleCell}>
            <Text style={styles.scheduleLabel}>Foreman Cell:</Text>
            <Text style={styles.scheduleValue}>—</Text>
          </View>
        )}
        <View style={[styles.scheduleCell, styles.startTimeCell]}>
          <Text style={styles.scheduleLabel}>Start Time:</Text>
          <Text style={styles.scheduleValue} numberOfLines={1}>
            {formatStartTime(item.startTime)}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenTimesheet}
        style={({ pressed }) => [styles.timesheetAction, pressed && styles.cardPressed]}
      >
        <Text style={styles.timesheetActionText}>Open Time Sheet</Text>
      </Pressable>
      {completed ? (
        <View style={styles.clockAction}>
          <Text style={styles.clockActionText}>Job Completed</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
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
          <Text style={styles.clockActionText}>{clockLabel}</Text>
        </Pressable>
      )}
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

  const load = useCallback(async () => {
    setError('');
    try {
      const [assignments, active, features] = await Promise.all([
        mobileApi.getAssignments(),
        mobileApi.getActiveClockIn(),
        mobileApi.getMobileFeatures(),
      ]);
      setItems(assignments);
      setActiveClockIn(active);
      setPreviousWeekEnabled(features.previousWeekEnabled);
      if (!features.previousWeekEnabled) setWeekStart(currentSaturday());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => subscribeToMobileRefresh(load), [load]);

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

  if (loading) return <LoadingView label="Loading assignments…" />;

  const weekEnd = shiftDate(weekStart, 6);
  const weekStartIso = toLocalIsoDate(weekStart);
  const weekEndIso = toLocalIsoDate(weekEnd);
  const visibleItems = items.filter((item) => {
    const assignmentEnd = item.endDate ?? item.assignedDate;
    return item.assignedDate <= weekEndIso && assignmentEnd >= weekStartIso;
  });
  const currentWeekStartIso = toLocalIsoDate(currentSaturday());
  const isCurrentWeek = weekStartIso === currentWeekStartIso;

  return (
    <Screen padded={false}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <View style={styles.weekControls}>
              <View style={styles.weekSummary}>
                <Text style={styles.weekSummaryEyebrow}>
                  {isCurrentWeek ? 'CURRENT WORK WEEK' : 'PREVIOUS WORK WEEK'}
                </Text>
                <Text style={styles.weekSummaryDates}>{shortWorkDate(weekStart)} – {shortWorkDate(weekEnd)}</Text>
              </View>
              {previousWeekEnabled ? (
                <View style={styles.weekButtonRow}>
                  <Pressable
                    onPress={() => setWeekStart(shiftDate(currentSaturday(), -7))}
                    style={({ pressed }) => [
                      styles.weekButton,
                      !isCurrentWeek && styles.weekButtonActive,
                      pressed && styles.weekPressed,
                    ]}
                  >
                    <Ionicons name="chevron-back" size={15} color={isCurrentWeek ? FF.primary : '#FFFFFF'} />
                    <Text style={[styles.weekButtonText, !isCurrentWeek && styles.weekButtonTextActive]}>
                      Previous Week
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setWeekStart(currentSaturday())}
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
                </View>
              ) : null}
            </View>
            <ImageBanner
              variant="full"
              source={IMAGERY.heroSite}
              title="My Assignments"
              subtitle="Your active and upcoming job sites"
            />
            <View style={screenLayout.listSpacer} />
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
              onOpenTimesheet={() => openTimesheet(item.id, item.assignedDate)}
              onOpenClock={() =>
                router.push({ pathname: '/(tabs)/clock', params: { assignmentId: item.id } })
              }
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
    borderColor: '#94A3B8',
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  assignmentHeader: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#050505',
  },
  assignmentHeaderText: {
    width: '100%',
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  informationRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#64748B',
    backgroundColor: '#F8FAFC',
  },
  informationLabel: {
    width: 104,
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#111827',
  },
  informationValue: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#111827',
  },
  informationLink: {
    fontFamily: fonts.bold,
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  scheduleRow: {
    minHeight: 32,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#64748B',
    backgroundColor: '#F8FAFC',
  },
  scheduleCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  startTimeCell: {
    borderLeftWidth: 1,
    borderLeftColor: '#64748B',
  },
  scheduleLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: '#111827',
  },
  scheduleValue: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 10,
    color: '#111827',
  },
  timesheetAction: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#FFF200',
  },
  timesheetActionText: {
    fontFamily: fonts.bold,
    fontStyle: 'italic',
    fontSize: 12,
    color: '#050505',
  },
  clockAction: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderTopWidth: 2,
    borderTopColor: '#FFFFFF',
    backgroundColor: '#2563EB',
  },
  clockActionIn: {
    backgroundColor: FF.green500,
  },
  clockActionOut: {
    backgroundColor: FF.red500,
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
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
  },
  weekSummary: {
    alignItems: 'center',
  },
  weekButtonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 6,
  },
  weekButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
  },
  weekButtonActive: {
    borderColor: FF.primary,
    backgroundColor: FF.primary,
  },
  weekButtonText: {
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 9,
    color: FF.primary,
  },
  weekButtonTextActive: {
    color: '#FFFFFF',
  },
  weekPressed: {
    opacity: 0.75,
  },
  weekSummaryEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 0.7,
    color: FF.primary,
  },
  weekSummaryDates: {
    marginTop: 4,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: FF.text,
  },
});
