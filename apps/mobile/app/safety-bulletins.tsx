import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StackListItem, StackListScreen } from '@/components/ui';
import { IMAGERY } from '@/constants/imagery';
import { mobileApi } from '@/lib/api';
import { cardShadow, FF, fonts } from '@/theme/brand';

type SafetyBulletin = Awaited<ReturnType<typeof mobileApi.getSafetyBulletins>>[number];

function formatSentDate(sentAt: string) {
  return new Date(sentAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function BulletinCard({ item, onPress }: { item: SafetyBulletin; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open safety bulletin: ${item.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <View style={styles.iconBadge}>
          <Ionicons name="shield-checkmark" size={20} color={FF.amber500} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>SAFETY UPDATE</Text>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        </View>
        <View style={styles.arrowBadge}>
          <Ionicons name="arrow-forward" size={17} color={FF.primary} />
        </View>
      </View>

      {item.message.trim() ? (
        <Text style={styles.preview} numberOfLines={2}>{item.message.trim()}</Text>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={styles.dateGroup}>
          <Ionicons name="calendar-outline" size={14} color={FF.textSecondary} />
          <Text style={styles.date}>{formatSentDate(item.sentAt)}</Text>
        </View>
        {item.jobSite?.name ? (
          <View style={styles.sitePill}>
            <Ionicons name="location-outline" size={12} color={FF.primary} />
            <Text style={styles.siteText} numberOfLines={1}>{item.jobSite.name}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function SafetyBulletinsScreen() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof mobileApi.getSafetyBulletins>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

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
    <StackListScreen
      fallbackHref="/"
      showAppHeader={false}
      showBanner={false}
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
      headerExtra={items.length ? (
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Ionicons name="shield-checkmark-outline" size={21} color="#15803D" />
          </View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionEyebrow}>SAFETY BULLETINS</Text>
            <Text style={styles.sectionTitle}>Your updates</Text>
            <Text style={styles.sectionSubtitle}>Stay informed and work safely</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{items.length}</Text>
            <Text style={styles.countLabel}>{items.length === 1 ? 'update' : 'updates'}</Text>
          </View>
        </View>
      ) : null}
      renderItem={({ item }) => (
        <StackListItem>
          <BulletinCard
            item={item}
            onPress={() => router.push({ pathname: '/safety-bulletin/[id]', params: { id: item.id } })}
          />
        </StackListItem>
      )}
    />
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 18,
    backgroundColor: FF.card,
    ...cardShadow,
  },
  sectionIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#EAF8EF',
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    marginBottom: 2,
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#15803D',
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: FF.text,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: FF.textSecondary,
  },
  countPill: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#F0FDF4',
  },
  countText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 16,
    color: '#15803D',
  },
  countLabel: {
    fontFamily: fonts.medium,
    fontSize: 8,
    color: '#15803D',
  },
  card: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E7EDF5',
    backgroundColor: FF.card,
    ...cardShadow,
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    marginBottom: 4,
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 1,
    color: '#B7791F',
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 21,
    color: FF.text,
  },
  arrowBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: FF.blue50,
  },
  preview: {
    marginTop: 14,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: FF.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  date: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: FF.textSecondary,
  },
  sitePill: {
    maxWidth: '55%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: FF.blue50,
  },
  siteText: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: 10,
    color: FF.primary,
  },
});
