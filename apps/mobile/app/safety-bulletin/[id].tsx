import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ErrorBanner, LoadingView, Screen } from '@/components/ui';
import { cardShadow, FF, fonts } from '@/theme/brand';
import { mobileApi } from '@/lib/api';

type SafetyBulletin = Awaited<ReturnType<typeof mobileApi.getSafetyBulletins>>[number];

export default function SafetyBulletinDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const [bulletin, setBulletin] = useState<SafetyBulletin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const items = await mobileApi.getSafetyBulletins();
      const found = items.find((item) => item.id === id) ?? null;
      setBulletin(found);
      if (!found) setError('This safety bulletin could not be found.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load safety bulletin');
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <LoadingView label="Loading safety bulletin…" />;

  return (
    <Screen scroll>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to safety bulletins"
        onPress={() => router.canGoBack() ? router.back() : router.replace('/safety-bulletins')}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <View style={styles.backIcon}>
          <Ionicons name="arrow-back" size={17} color={FF.primary} />
        </View>
        <Text style={styles.backLabel}>All bulletins</Text>
        <Ionicons name="chevron-forward" size={15} color={FF.textMuted} />
      </Pressable>

      <ErrorBanner message={error} />
      {bulletin ? (
        <View style={styles.card}>
          <View style={styles.heroRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="shield-checkmark" size={21} color={FF.amber500} />
            </View>
            <View style={styles.eyebrowPill}>
              <View style={styles.statusDot} />
              <Text style={styles.eyebrow}>SAFETY UPDATE</Text>
            </View>
          </View>
          <Text style={styles.title}>{bulletin.title}</Text>
          <View style={styles.metadataRow}>
            <View style={styles.datePill}>
              <Ionicons name="calendar-outline" size={15} color={FF.primary} />
              <Text style={styles.date}>{new Date(bulletin.sentAt).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric',
              })}</Text>
            </View>
            {bulletin.jobSite?.name ? (
              <View style={styles.sitePill}>
                <Ionicons name="location-outline" size={14} color={FF.textSecondary} />
                <Text style={styles.siteText} numberOfLines={1}>{bulletin.jobSite.name}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.messagePanel}>
            <View style={styles.messageHeading}>
              <Text style={styles.messageLabel}>MESSAGE</Text>
              <View style={styles.messageRule} />
            </View>
            <Text selectable style={styles.message}>{bulletin.message}</Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 18,
    paddingLeft: 7,
    paddingRight: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: FF.card,
    borderWidth: 1,
    borderColor: '#E7EDF5',
  },
  backIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: FF.blue50,
  },
  backLabel: { fontFamily: fonts.semiBold, fontSize: 12, color: FF.text },
  card: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: FF.card,
    borderWidth: 1,
    borderColor: '#E7EDF5',
    ...cardShadow,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
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
  eyebrowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFBEB',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: FF.amber500 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1, color: '#A16207' },
  title: { marginTop: 18, fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.35, color: FF.text },
  metadataRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 15 },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: FF.blue50,
  },
  date: { fontFamily: fonts.medium, fontSize: 11, color: FF.primary },
  sitePill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  siteText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 11, color: FF.textSecondary },
  messagePanel: {
    marginTop: 20,
    padding: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#EDF1F7',
    backgroundColor: '#FAFBFD',
  },
  messageHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  messageLabel: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.1, color: FF.textMuted },
  messageRule: { height: 1, flex: 1, backgroundColor: '#E8EDF4' },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 25, color: FF.textSecondary },
  pressed: { opacity: 0.75 },
});
