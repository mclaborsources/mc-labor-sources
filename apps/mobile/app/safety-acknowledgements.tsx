import { useCallback, useEffect, useState } from 'react';

import { IMAGERY } from '@/constants/imagery';
import { ListCard, StackListItem, StackListScreen } from '@/components/ui';
import { mobileApi } from '@/lib/api';

export default function SafetyAcknowledgementsScreen() {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof mobileApi.getSafetyAcknowledgementReport>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await mobileApi.getSafetyAcknowledgementReport());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load report');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <StackListScreen
      fallbackHref="/"
      loading={loading}
      loadingLabel="Loading acknowledgements…"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      error={error}
      items={items}
      keyExtractor={(item) => `${item.bulletinId}:${item.employeeName}:${item.jobSiteName}`}
      banner={{
        source: IMAGERY.heroAttendance,
        title: 'Safety Acknowledgements',
        subtitle: 'Worker completion by job site',
      }}
      emptyMessage="No targeted safety acknowledgements to review."
      emptyIcon="🛡️"
      renderItem={({ item }) => (
        <StackListItem>
          <ListCard
            size="comfortable"
            icon="shield-checkmark-outline"
            iconAccent={item.acknowledgedAt ? 'green' : 'amber'}
            title={item.employeeName}
            subtitle={item.bulletinTitle}
            meta={item.jobSiteName}
            status={item.acknowledgedAt ? 'ACKNOWLEDGED' : 'PENDING'}
          />
        </StackListItem>
      )}
    />
  );
}
