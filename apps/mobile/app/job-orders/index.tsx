import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ListCard, StackListItem, StackListScreen } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { IMAGERY } from '@/constants/imagery';

export default function JobOrdersScreen() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getJobOrders>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await mobileApi.getJobOrders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job orders');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <StackListScreen
      fallbackHref="/(tabs)"
      loading={loading}
      loadingLabel="Loading job orders…"
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
        source: IMAGERY.heroWorkforce,
        title: 'Job Orders',
        subtitle: 'Review and acknowledge your orders',
      }}
      emptyMessage="No job orders assigned."
      emptyIcon="📄"
      renderItem={({ item }) => (
        <StackListItem>
          <Link href={`/job-orders/${item.id}` as never} asChild>
            <ListCard
              size="comfortable"
              titleLines={1}
              icon="document-text-outline"
              iconAccent="indigo"
              title={item.title}
              meta={item.orderNumber}
              status={item.status}
            />
          </Link>
        </StackListItem>
      )}
    />
  );
}
