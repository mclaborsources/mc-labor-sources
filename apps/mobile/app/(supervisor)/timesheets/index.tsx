import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { InfoBanner, ListCard, StackListItem, StackListScreen } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { IMAGERY } from '@/constants/imagery';
import { FF, fonts } from '@/theme/brand';

export default function SupervisorTimesheetsScreen() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getSupervisorTimesheets>>>([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await mobileApi.getSupervisorTimesheets({ pendingOnly }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timesheets');
    }
  }, [pendingOnly]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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
      items={items}
      keyExtractor={(item) => item.id}
      banner={{
        source: IMAGERY.heroTimesheets,
        title: 'Site Timesheets',
        subtitle: 'Review and sign off on assigned job sites',
      }}
      headerExtra={
        <>
          <View style={styles.filterRow}>
            <Pressable
              style={[styles.filterChip, pendingOnly && styles.filterChipActive]}
              onPress={() => setPendingOnly(true)}
            >
              <Text style={[styles.filterText, pendingOnly && styles.filterTextActive]}>Pending sign</Text>
            </Pressable>
            <Pressable
              style={[styles.filterChip, !pendingOnly && styles.filterChipActive]}
              onPress={() => setPendingOnly(false)}
            >
              <Text style={[styles.filterText, !pendingOnly && styles.filterTextActive]}>All</Text>
            </Pressable>
          </View>
          <InfoBanner message="Tap a timesheet to review entries and add your supervisor signature." />
        </>
      }
      emptyMessage={pendingOnly ? 'No timesheets awaiting signature.' : 'No timesheets on your sites.'}
      emptyIcon="✍️"
      renderItem={({ item }) => {
        const employeeName = item.employee
          ? `${item.employee.firstName} ${item.employee.lastName}`
          : 'Employee';
        return (
          <StackListItem>
            <Link href={`/(supervisor)/timesheets/${item.id}` as never} asChild>
              <ListCard
                size="comfortable"
                titleLines={2}
                icon="create-outline"
                iconAccent="amber"
                title={employeeName}
                subtitle={item.jobSite?.name ?? 'Job site'}
                meta={`${item.totalHours}h · ${item.status}`}
                status={item.status}
              />
            </Link>
          </StackListItem>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FF.border,
    backgroundColor: FF.card,
  },
  filterChipActive: {
    borderColor: FF.primary,
    backgroundColor: '#EEF2FF',
  },
  filterText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: FF.textSecondary,
  },
  filterTextActive: {
    color: FF.primary,
  },
});
