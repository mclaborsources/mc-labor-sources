import { useCallback, useEffect, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Button, InfoBanner, ListCard, StackListItem, StackListScreen } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { IMAGERY } from '@/constants/imagery';

export default function TimesheetsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getTimesheets>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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
        title: 'My Timesheets',
        subtitle: 'View your submitted hours',
      }}
      headerExtra={
        <InfoBanner message="Hours from each clock-out are combined into one weekly timesheet for each assignment." />
      }
      emptyMessage="No timesheets yet."
      emptyIcon="🗓️"
      renderItem={({ item }) => (
        <StackListItem>
          <Link href={`/my-timesheets/${item.id}` as never} asChild>
            <ListCard
              size="comfortable"
              titleLines={1}
              icon="calendar-outline"
              iconAccent="violet"
              title={item.jobSite?.name ?? 'Job Site'}
              subtitle={`${item.totalHours}h total`}
              meta={
                item.workDate
                  ? new Date(`${item.workDate}T12:00:00`).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : item.weekStartDate && item.weekEndDate
                    ? `${item.weekStartDate} – ${item.weekEndDate}`
                    : undefined
              }
              status={item.status}
            />
          </Link>
          {item.assignmentId ? (
            <Button
              label="Open Timesheet"
              icon="create-outline"
              onPress={() =>
                router.push(
                  `/manual-timesheet/${item.assignmentId}${
                    item.weekStartDate
                      ? `?weekStart=${encodeURIComponent(item.weekStartDate)}`
                      : ''
                  }` as never,
                )
              }
            />
          ) : null}
        </StackListItem>
      )}
    />
  );
}
