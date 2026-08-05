import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ListCard, StackListItem, StackListScreen } from '@/components/ui';
import { FF } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';
import { mobileApi } from '@/lib/api';

type NotificationItem = Awaited<ReturnType<typeof mobileApi.getNotifications>>[number];

function notificationIcon(type: string): 'document-text-outline' | 'shield-checkmark-outline' | 'notifications-outline' {
  if (type === 'JOB_ORDER') return 'document-text-outline';
  if (type === 'SAFETY') return 'shield-checkmark-outline';
  return 'notifications-outline';
}

function notificationAccent(type: string): 'indigo' | 'amber' | 'blue' {
  if (type === 'JOB_ORDER') return 'indigo';
  if (type === 'SAFETY') return 'amber';
  return 'blue';
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await mobileApi.getNotifications());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onPress = async (item: NotificationItem) => {
    if (item.readAt) return;
    try {
      const updated = await mobileApi.markNotificationRead(item.id);
      setItems((prev) => prev.map((n) => (n.id === item.id ? updated : n)));
    } catch {
      /* keep list as-is */
    }
  };

  return (
    <StackListScreen
      fallbackHref="/"
      loading={loading}
      loadingLabel="Loading notifications…"
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
        source: IMAGERY.heroNotifications,
        title: 'Notifications',
        subtitle: 'Updates from your team',
      }}
      emptyMessage="No notifications yet."
      emptyIcon="🔔"
      renderItem={({ item }) => {
        const unread = !item.readAt;
        return (
          <StackListItem>
            <ListCard
              size="comfortable"
              titleLines={2}
              subtitleLines={3}
              icon={notificationIcon(item.type)}
              iconAccent={notificationAccent(item.type)}
              title={item.title}
              subtitle={item.message}
              meta={new Date(item.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              status={unread ? 'NEW' : undefined}
              onPress={() => onPress(item)}
              style={unread ? styles.unread : undefined}
            />
          </StackListItem>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  unread: {
    borderColor: '#BFDBFE',
    backgroundColor: FF.bg,
  },
});
