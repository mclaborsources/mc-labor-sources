import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND_PHONE, BRAND_PHONE_HREF, FF, fonts } from '@/theme/brand';
import { requestMobileRefresh } from '@/lib/mobile-refresh';

export default function HomeScreen() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [refreshingApp, setRefreshingApp] = useState(false);

  async function handleRefresh() {
    if (refreshingApp) return;
    setRefreshingApp(true);
    try {
      await Promise.all([refresh(), requestMobileRefresh()]);
    } finally {
      setRefreshingApp(false);
    }
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.accountCard}>
        <View style={styles.accountHero}>
          <LinearGradient colors={['#22C55E', '#15803D']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.accountHeroIdentity}>
            <Text style={styles.accountEyebrow}>SIGNED IN AS</Text>
            <Text style={styles.accountName} numberOfLines={2}>{user?.name ?? 'Worker'}</Text>
          </View>
        </View>
        <View style={styles.accountDivider} />
        <View style={styles.accountActionsRow}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/profile')} style={styles.accountLink}>
            <Text style={styles.accountLabel}>Account</Text>
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh account and clock status"
            accessibilityState={{ busy: refreshingApp, disabled: refreshingApp }}
            disabled={refreshingApp}
            onPress={() => void handleRefresh()}
            style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
          >
            {refreshingApp ? <ActivityIndicator size="small" color="#2563EB" /> : <Ionicons name="refresh" size={17} color="#2563EB" />}
            <Text style={styles.refreshText}>{refreshingApp ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.quickLinks}>
      <View style={styles.utilityCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Job Information. View job details and clock in."
          onPress={() => router.push('/(tabs)/assignments')}
          style={({ pressed }) => [styles.utilityRow, pressed && styles.rowPressed]}
        >
          <View style={styles.siteIcon}><Ionicons name="business-outline" size={21} color="#2563EB" /></View>
          <View style={styles.utilityCopy}>
            <Text style={[styles.utilityTitle, styles.jobInformationText]}>Job Information</Text>
            <Text style={[styles.utilitySubtitle, styles.jobInformationText]}>View job details and clock in</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </Pressable>
      </View>
      <View style={styles.utilityCard}>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(BRAND_PHONE_HREF)}
          style={({ pressed }) => [styles.utilityRow, pressed && styles.rowPressed]}
        >
          <View style={styles.phoneIcon}><Ionicons name="call" size={19} color="#FFFFFF" /></View>
          <View style={styles.utilityCopy}>
            <Text style={styles.utilityTitle}>Need help?</Text>
            <Text style={styles.phoneNumber}>{BRAND_PHONE}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </Pressable>
      </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 10, paddingTop: 0, paddingBottom: 14 },
  accountCard: { gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, borderWidth: 1, borderColor: FF.borderInput, borderRadius: 19, backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  accountHero: { position: 'relative', overflow: 'hidden', padding: 14, borderRadius: 18 },
  accountHeroIdentity: { minHeight: 68, justifyContent: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' },
  accountEyebrow: { fontFamily: fonts.semiBold, fontSize: 10, letterSpacing: 0.6, color: '#DCFCE7' },
  accountName: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 25, color: '#FFFFFF' },
  accountDivider: { height: 1, marginTop: 8, backgroundColor: '#F1F5F9' },
  accountActionsRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  accountLabel: { fontFamily: fonts.semiBold, fontSize: 16, color: FF.text },
  refreshButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  refreshText: { fontFamily: fonts.semiBold, fontSize: 13, color: '#2563EB' },
  utilityCard: { paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: FF.borderInput, borderRadius: 19, backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  quickLinks: { marginTop: 20, gap: 36 },
  jobInformationText: { textAlign: 'center' },
  utilityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 },
  siteIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EAF2FF' },
  phoneIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#22C55E' },
  utilityCopy: { flex: 1, gap: 3 },
  utilityTitle: { fontFamily: fonts.semiBold, fontSize: 14, color: FF.text },
  utilitySubtitle: { fontFamily: fonts.regular, fontSize: 12, color: '#64748B' },
  phoneNumber: { fontFamily: fonts.medium, fontSize: 13, color: '#2563EB', textDecorationLine: 'underline' },
  pressed: { opacity: 0.8 },
  rowPressed: { opacity: 0.75 },
});
