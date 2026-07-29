import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, InfoBanner, ListCard, StackListItem, StackListScreen } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { IMAGERY } from '@/constants/imagery';
import { FF } from '@/theme/brand';

function toIsoDate(date: Date) {
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

function shortDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TimesheetsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getTimesheets>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(() => currentSaturday());
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await mobileApi.getTimesheets());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timesheets');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const weekStartIso = toIsoDate(weekStart);
  const weekEnd = shiftDate(weekStart, 6);
  const weekEndIso = toIsoDate(weekEnd);
  const dayGroups = useMemo(() => {
    const visible = items.filter(
      (item) =>
        item.weekStartDate === weekStartIso ||
        (item.workDate != null && item.workDate >= weekStartIso && item.workDate <= weekEndIso),
    );
    const groups = new Map<string, typeof visible>();
    visible.forEach((item) => {
      const day = item.assignment?.assignedDate ?? item.workDate ?? item.weekStartDate ?? weekStartIso;
      groups.set(day, [...(groups.get(day) ?? []), item]);
    });
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, timesheets]) => ({
        day,
        timesheets: [...timesheets].sort((left, right) =>
          (left.assignment?.startTime ?? '').localeCompare(right.assignment?.startTime ?? ''),
        ),
        totalHours: timesheets.reduce((sum, item) => sum + Number(item.totalHours ?? 0), 0),
        submitted: timesheets.filter((item) => item.status !== 'DRAFT').length,
      }));
  }, [items, weekEndIso, weekStartIso]);

  return (
    <StackListScreen
      loading={loading}
      loadingLabel="Loading timesheets…"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      error={error}
      items={dayGroups}
      keyExtractor={(group) => group.day}
      banner={{
        source: IMAGERY.heroTimesheets,
        title: 'My Timesheets',
        subtitle: 'Timesheets grouped by workday',
      }}
      headerExtra={
        <View style={styles.headerExtra}>
          <View style={styles.weekSummary}>
            <Text style={styles.weekLabel}>SELECTED WORK WEEK</Text>
            <Text style={styles.weekDates}>{shortDate(weekStart)} – {shortDate(weekEnd)}</Text>
          </View>
          <View style={styles.weekButtons}>
            <Pressable
              onPress={() => setWeekStart((current) => shiftDate(current, -7))}
              style={styles.weekButton}
            >
              <Ionicons name="chevron-back" size={14} color={FF.primary} />
              <Text style={styles.weekButtonText}>Previous</Text>
            </Pressable>
            <Pressable onPress={() => setWeekStart(currentSaturday())} style={styles.thisWeekButton}>
              <Text style={styles.thisWeekButtonText}>This Week</Text>
            </Pressable>
            <Pressable
              onPress={() => setWeekStart((current) => shiftDate(current, 7))}
              style={styles.weekButton}
            >
              <Text style={styles.weekButtonText}>Next</Text>
              <Ionicons name="chevron-forward" size={14} color={FF.primary} />
            </Pressable>
          </View>
          <InfoBanner message="Each day is summarized below. Expand a day to review its individual job timesheets." />
        </View>
      }
      emptyMessage="No timesheets for this work week."
      emptyIcon="🗓️"
      renderItem={({ item: group }) => {
        const expanded = expandedDays[group.day] ?? true;
        const label = new Date(`${group.day}T12:00:00`).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });
        return (
          <StackListItem>
            <View style={styles.dayGroup}>
              <Pressable
                style={styles.dayHeader}
                onPress={() =>
                  setExpandedDays((current) => ({ ...current, [group.day]: !expanded }))
                }
              >
                <View style={styles.dayHeading}>
                  <Text style={styles.dayTitle}>{label}</Text>
                  <Text style={styles.dayMeta}>
                    {group.timesheets.length} timesheet{group.timesheets.length === 1 ? '' : 's'} ·{' '}
                    {group.totalHours.toFixed(2)}h total
                  </Text>
                  <Text style={styles.dayStatus}>
                    {group.submitted} of {group.timesheets.length} submitted
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={FF.primary}
                />
              </Pressable>

              {expanded ? (
                <View style={styles.timesheetList}>
                  {group.timesheets.map((timesheet) => (
                    <View key={timesheet.id} style={styles.timesheetItem}>
                      <Link href={`/my-timesheets/${timesheet.id}` as never} asChild>
                        <ListCard
                          size="comfortable"
                          titleLines={1}
                          icon="calendar-outline"
                          iconAccent="violet"
                          title={timesheet.jobSite?.name ?? 'Job Site'}
                          subtitle={`${timesheet.totalHours}h total`}
                          meta={
                            timesheet.assignment?.startTime
                              ? `Visit started ${timesheet.assignment.startTime}`
                              : 'Assignment timesheet'
                          }
                          status={timesheet.status}
                        />
                      </Link>
                      {timesheet.assignmentId ? (
                        <Button
                          label="Open Timesheet"
                          icon="create-outline"
                          onPress={() =>
                            router.push(
                              `/manual-timesheet/${timesheet.assignmentId}${
                                timesheet.weekStartDate
                                  ? `?weekStart=${encodeURIComponent(timesheet.weekStartDate)}`
                                  : ''
                              }` as never,
                            )
                          }
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </StackListItem>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  headerExtra: { gap: 12 },
  weekSummary: { alignItems: 'center' },
  weekLabel: { color: FF.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  weekDates: { color: '#0F172A', fontSize: 16, fontWeight: '800', marginTop: 2 },
  weekButtons: { flexDirection: 'row', gap: 8 },
  weekButton: {
    alignItems: 'center',
    borderColor: '#BFDBFE',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  weekButtonText: { color: FF.primary, fontSize: 12, fontWeight: '700' },
  thisWeekButton: {
    alignItems: 'center',
    backgroundColor: FF.primary,
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  thisWeekButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  dayGroup: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dayHeader: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dayHeading: { flex: 1 },
  dayTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  dayMeta: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 3 },
  dayStatus: { color: '#047857', fontSize: 11, fontWeight: '700', marginTop: 3 },
  timesheetList: { gap: 10, padding: 10 },
  timesheetItem: { gap: 6 },
});
