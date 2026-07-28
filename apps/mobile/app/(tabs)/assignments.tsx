import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorBanner, ImageBanner, ListCard, LoadingView, Screen, screenLayout } from '@/components/ui';
import { FF, fonts, theme } from '@/theme/brand';
import { mobileApi } from '@/lib/api';
import { IMAGERY } from '@/constants/imagery';

function formatAssignmentDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

function assignmentPeriodLabel(assignedDate: string) {
  const thisWeekStart = currentSaturday();
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const thisWeekStartIso = toLocalIsoDate(thisWeekStart);
  const lastWeekStartIso = toLocalIsoDate(lastWeekStart);
  const nextWeekStartIso = toLocalIsoDate(nextWeekStart);

  if (assignedDate >= thisWeekStartIso && assignedDate < nextWeekStartIso) return 'THIS WEEK';
  if (assignedDate >= lastWeekStartIso && assignedDate < thisWeekStartIso) return 'LAST WEEK';
  return undefined;
}

export default function AssignmentsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const useStackedCards = width < 480;
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getAssignments>>>([]);
  const [activeClockIn, setActiveClockIn] = useState<Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(() => currentSaturday());

  const load = useCallback(async () => {
    setError('');
    try {
      const [assignments, active] = await Promise.all([
        mobileApi.getAssignments(),
        mobileApi.getActiveClockIn(),
      ]);
      setItems(assignments);
      setActiveClockIn(active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openTimesheet = async (assignmentId: string) => {
    setError('');
    try {
      const latestWeek = await mobileApi.getLatestTimesheetWeekForAssignment(assignmentId);
      const weekParam = latestWeek?.weekStartDate
        ? `?weekStart=${encodeURIComponent(latestWeek.weekStartDate)}`
        : '';
      router.push(`/manual-timesheet/${assignmentId}${weekParam}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open timesheet');
    }
  };

  if (loading) return <LoadingView label="Loading assignments…" />;

  const weekEnd = shiftDate(weekStart, 6);
  const weekStartIso = toLocalIsoDate(weekStart);
  const weekEndIso = toLocalIsoDate(weekEnd);
  const visibleItems = items.filter(
    (item) => item.assignedDate >= weekStartIso && item.assignedDate <= weekEndIso,
  );
  const thisWeek = currentSaturday();
  const isCurrentWeek = toLocalIsoDate(thisWeek) === weekStartIso;

  return (
    <Screen padded={false}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <View style={styles.weekControls}>
              <View style={styles.weekSummary}>
                <Text style={styles.weekSummaryEyebrow}>{isCurrentWeek ? 'CURRENT WORK WEEK' : 'SELECTED WORK WEEK'}</Text>
                <Text style={styles.weekSummaryDates}>{shortWorkDate(weekStart)} – {shortWorkDate(weekEnd)}</Text>
              </View>
              <View style={styles.weekButtonRow}>
                <Pressable onPress={() => setWeekStart((current) => shiftDate(current, -7))} style={({ pressed }) => [styles.weekButton, pressed && styles.weekPressed]}>
                  <Ionicons name="chevron-back" size={15} color={FF.primary} />
                  <Text style={styles.weekButtonText}>Previous Week</Text>
                </Pressable>
                <Pressable onPress={() => setWeekStart(currentSaturday())} style={({ pressed }) => [styles.weekButton, isCurrentWeek && styles.thisWeekButtonActive, pressed && styles.weekPressed]}>
                  <Ionicons name="calendar-outline" size={14} color={isCurrentWeek ? '#FFFFFF' : FF.primary} />
                  <Text style={[styles.weekButtonText, isCurrentWeek && styles.thisWeekButtonTextActive]}>This Week</Text>
                </Pressable>
                <Pressable onPress={() => setWeekStart((current) => shiftDate(current, 7))} style={({ pressed }) => [styles.weekButton, pressed && styles.weekPressed]}>
                  <Text style={styles.weekButtonText}>Next Week</Text>
                  <Ionicons name="chevron-forward" size={15} color={FF.primary} />
                </Pressable>
              </View>
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
            <ListCard
              size="comfortable"
              layout={useStackedCards ? 'stacked' : 'default'}
              titleLines={1}
              icon="location-outline"
              iconAccent="blue"
              title={item.jobSite?.name ?? 'Job Site'}
              subtitle={item.customer?.companyName}
              meta={formatAssignmentDate(item.assignedDate)}
              periodLabel={assignmentPeriodLabel(item.assignedDate)}
              status={item.status}
              onPress={() => router.push(`/assignments/${item.id}` as never)}
              actionLabel="Open Timesheet"
              actionIcon="calendar-outline"
              onActionPress={() => void openTimesheet(item.id)}
              secondaryActionLabel={
                activeClockIn
                  ? activeClockIn.assignmentId === item.id
                    ? 'Clock Out'
                    : 'View Clock'
                  : 'Clock In'
              }
              secondaryActionIcon={activeClockIn?.assignmentId === item.id ? 'stop-circle-outline' : 'time-outline'}
              onSecondaryActionPress={() => router.push('/(tabs)/clock')}
            />
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
  },
  weekButtonText: {
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 9,
    color: FF.primary,
  },
  thisWeekButtonActive: {
    borderColor: FF.primary,
    backgroundColor: FF.primary,
  },
  thisWeekButtonTextActive: {
    color: '#FFFFFF',
  },
  weekPressed: {
    opacity: 0.75,
  },
  weekSummary: {
    alignItems: 'center',
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
