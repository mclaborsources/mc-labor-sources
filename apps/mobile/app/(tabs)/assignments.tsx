import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState, ErrorBanner, ImageBanner, ListCard, LoadingView, Screen, screenLayout } from '@/components/ui';
import { theme } from '@/theme/brand';
import { mobileApi } from '@/lib/api';
import { IMAGERY } from '@/constants/imagery';

function formatAssignmentDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AssignmentsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getAssignments>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await mobileApi.getAssignments());
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

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
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
            <EmptyState message="No assignments found." icon="📋" />
          </View>
        }
        renderItem={({ item }) => (
          <View style={screenLayout.itemWrap}>
            <ListCard
              size="comfortable"
              titleLines={1}
              icon="location-outline"
              iconAccent="blue"
              title={item.jobSite?.name ?? 'Job Site'}
              subtitle={item.customer?.companyName}
              meta={formatAssignmentDate(item.assignedDate)}
              status={item.status}
              onPress={() => router.push(`/assignments/${item.id}` as never)}
              actionLabel="Open Timesheet"
              actionIcon="calendar-outline"
              onActionPress={() => void openTimesheet(item.id)}
            />
          </View>
        )}
      />
    </Screen>
  );
}
