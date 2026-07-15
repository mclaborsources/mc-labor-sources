import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState, ErrorBanner, ImageBanner, ListCard, LoadingView, Screen, screenLayout } from '@/components/ui';
import { mobileApi, type MessageContact } from '@/lib/api';
import { theme } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';

export function MessagesListScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setContacts(await mobileApi.getMessageContacts()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load contacts'); }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const open = async (contact: MessageContact) => {
    const key = `${contact.contactUserId}:${contact.jobSiteId}`;
    setOpening(key);
    setError('');
    try {
      const conversationId = contact.conversationId ?? await mobileApi.openMessageConversation(contact.contactUserId, contact.jobSiteId);
      router.push({ pathname: '/messages/[id]', params: { id: conversationId, name: contact.contactName, site: contact.jobSiteName } });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open conversation'); }
    finally { setOpening(null); }
  };

  if (loading) return <LoadingView label="Loading messages…" />;
  return (
    <Screen padded={false}>
      <FlatList
        data={contacts}
        keyExtractor={(item) => `${item.contactUserId}:${item.jobSiteId}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.colors.primary} />}
        contentContainerStyle={screenLayout.listContent}
        ListHeaderComponent={<><ImageBanner variant="full" source={IMAGERY.heroWorkforce} title="Messages" subtitle="Your job-site conversations" /><View style={screenLayout.listSpacer} />{error ? <View style={screenLayout.itemWrap}><ErrorBanner message={error} /></View> : null}</>}
        ListEmptyComponent={<View style={screenLayout.itemWrap}><EmptyState icon="💬" message="No connected workers or supervisors were found." /></View>}
        renderItem={({ item }) => {
          const key = `${item.contactUserId}:${item.jobSiteId}`;
          return <View style={screenLayout.itemWrap}><ListCard
            onPress={() => void open(item)} disabled={opening !== null}
            icon="chatbubble-ellipses-outline" iconAccent={item.unreadCount ? 'rose' : 'blue'}
            title={item.contactName} subtitle={item.lastMessage ?? `Start a conversation about ${item.jobSiteName}`}
            meta={`${item.jobSiteName}${item.unreadCount ? ` · ${item.unreadCount} unread` : ''}`}
            status={opening === key ? 'OPENING' : undefined} size="comfortable" subtitleLines={2}
          /></View>;
        }}
      />
    </Screen>
  );
}
