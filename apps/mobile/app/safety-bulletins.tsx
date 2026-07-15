import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { fonts, theme } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';
import { mobileApi } from '@/lib/api';
import { Button, ListCard, ModalSheet, StackListItem, StackListScreen, SuccessBanner } from '@/components/ui';

export default function SafetyBulletinsScreen() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getSafetyBulletins>>>([]);
  const [selected, setSelected] = useState<(typeof items)[0] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [acknowledging, setAcknowledging] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await mobileApi.getSafetyBulletins());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load safety bulletins');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <>
      <StackListScreen
        loading={loading}
        loadingLabel="Loading safety bulletins…"
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
          source: IMAGERY.heroAttendance,
          title: 'Safety Bulletins',
          subtitle: 'Important safety updates from your team',
        }}
        emptyMessage="No safety bulletins."
        emptyIcon="🛡️"
        renderItem={({ item }) => (
          <StackListItem>
            <ListCard
              size="comfortable"
              titleLines={1}
              icon="shield-checkmark-outline"
              iconAccent="amber"
              title={item.title}
              status={item.acknowledgedAt ? 'ACKNOWLEDGED' : 'ACTION REQUIRED'}
              meta={new Date(item.sentAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              onPress={() => setSelected(item)}
            />
          </StackListItem>
        )}
      />

      <ModalSheet visible={!!selected} title={selected?.title ?? ''} onClose={() => setSelected(null)}>
        <Text style={styles.body}>{selected?.message}</Text>
        {selected?.acknowledgedAt ? <SuccessBanner message={`Acknowledged ${new Date(selected.acknowledgedAt).toLocaleString()}`} /> : <Button label="Acknowledge Safety Bulletin" loading={acknowledging} icon="shield-checkmark-outline" onPress={async () => { if (!selected) return; setAcknowledging(true); try { await mobileApi.acknowledgeSafetyBulletin(selected.id); await load(); setSelected({ ...selected, acknowledgedAt: new Date().toISOString() }); } catch (err) { setError(err instanceof Error ? err.message : 'Could not acknowledge bulletin'); } finally { setAcknowledging(false); } }} />}
      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: theme.colors.textSecondary,
    lineHeight: 24,
    paddingBottom: 16,
  },
});
