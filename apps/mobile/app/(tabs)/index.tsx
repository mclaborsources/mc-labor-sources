import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND_PHONE, BRAND_PHONE_HREF, FF, fonts } from '@/theme/brand';
import { mobileApi } from '@/lib/api';
import { requestMobileRefresh, subscribeToMobileRefresh } from '@/lib/mobile-refresh';

type ActiveClockIn = Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>;
type WorkerAssignment = Awaited<ReturnType<typeof mobileApi.getAssignments>>[number];

export default function HomeScreen() {
  const { user, refresh, signOut } = useAuth();
  const router = useRouter();
  const [activeClockIn, setActiveClockIn] = useState<ActiveClockIn>(null);
  const [clockableAssignment, setClockableAssignment] = useState<WorkerAssignment | null>(null);
  const [clockStatusLoaded, setClockStatusLoaded] = useState(false);
  const [refreshingApp, setRefreshingApp] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadClockStatus = useCallback(async () => {
    const [clockResult, assignmentResult] = await Promise.allSettled([
      mobileApi.getActiveClockIn(),
      mobileApi.getAssignments(),
    ]);
    setActiveClockIn(clockResult.status === 'fulfilled' ? clockResult.value : null);
    const eligibleAssignment = assignmentResult.status === 'fulfilled'
      ? assignmentResult.value.find((assignment) => ['PENDING', 'ACTIVE', 'ACCEPTED'].includes(assignment.status.toUpperCase())) ?? null
      : null;
    setClockableAssignment(eligibleAssignment);
    setClockStatusLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadClockStatus();
    const unsubscribe = subscribeToMobileRefresh(loadClockStatus);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadClockStatus();
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [loadClockStatus]));

  async function handleRefresh() {
    if (refreshingApp) return;
    setRefreshingApp(true);
    try {
      await Promise.all([refresh(), requestMobileRefresh()]);
      await loadClockStatus();
    } finally {
      setRefreshingApp(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/(auth)/login');
    } finally {
      setSigningOut(false);
    }
  }

  const clockedIn = Boolean(activeClockIn);
  const statusTitle = !clockStatusLoaded
    ? 'CHECKING CLOCK STATUS'
    : clockedIn ? 'YOU ARE CLOCKED IN' : 'YOU ARE CLOCKED OUT';
  const statusMessage = !clockStatusLoaded
    ? 'Checking your current shift and assignments…'
    : clockedIn
      ? `You are working${activeClockIn?.jobSiteName ? ` at ${activeClockIn.jobSiteName}` : ''}.`
      : clockableAssignment?.status.toUpperCase() === 'PENDING'
        ? 'Your new assignment is ready. Tap to accept and clock in.'
        : clockableAssignment
        ? 'You are currently clocked out. Tap to clock in when ready.'
        : 'You are currently clocked out. No active assignments are available.';
  const clockButtonDisabled = !clockStatusLoaded || (!clockedIn && !clockableAssignment);

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.clockCard}>
        <View style={styles.clockStatusRow}>
          <View style={[styles.clockIcon, clockedIn && styles.clockIconActive]}>
            <Ionicons name={clockedIn ? 'checkmark' : 'time-outline'} size={25} color={clockedIn ? '#15803D' : '#64748B'} />
          </View>
          <View style={styles.clockCopy}>
            <Text style={[styles.clockStatusTitle, clockedIn && styles.clockStatusTitleActive]}>{statusTitle}</Text>
            <Text style={styles.clockStatusMessage}>{statusMessage}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clockedIn ? 'View current shift' : 'Clock in'}
          accessibilityState={{ disabled: clockButtonDisabled }}
          disabled={clockButtonDisabled}
          onPress={() => router.push(clockableAssignment && !clockedIn
            ? {
                pathname: '/(tabs)/clock',
                params: {
                  assignmentId: clockableAssignment.id,
                  ...(clockableAssignment.status.toUpperCase() === 'PENDING' ? { autoClockIn: 'true' } : {}),
                },
              }
            : '/(tabs)/clock')}
          style={({ pressed }) => [styles.clockButton, pressed && !clockButtonDisabled && styles.pressed, clockButtonDisabled && styles.buttonDisabled]}
        >
          {clockStatusLoaded ? <Ionicons name={clockedIn ? 'time-outline' : 'log-in-outline'} size={19} color={clockButtonDisabled ? '#64748B' : '#FFFFFF'} /> : <ActivityIndicator size="small" color="#FFFFFF" />}
          <Text style={[styles.clockButtonText, clockButtonDisabled && clockStatusLoaded && styles.clockButtonDisabledText]}>{!clockStatusLoaded ? 'PLEASE WAIT' : clockedIn ? 'VIEW CURRENT SHIFT' : 'CLOCK IN'}</Text>
        </Pressable>
      </View>

      <View style={styles.accountCard}>
        <Text style={styles.accountEyebrow}>SIGNED IN AS</Text>
        <View style={styles.accountNameRow}>
          <Text style={styles.accountName} numberOfLines={1}>{user?.name ?? 'Worker'}</Text>
          <View style={styles.signedInPill}>
            <Ionicons name="checkmark-circle" size={13} color="#15803D" />
            <Text style={styles.signedInText}>Signed in</Text>
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
        <View style={styles.accountDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          accessibilityState={{ busy: signingOut, disabled: signingOut }}
          disabled={signingOut}
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
        >
          {signingOut ? <ActivityIndicator size="small" color="#B91C1C" /> : <Ionicons name="log-out-outline" size={17} color="#B91C1C" />}
          <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign Out'}</Text>
        </Pressable>
      </View>

      <View style={styles.utilityCard}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/assignments')}
          style={({ pressed }) => [styles.utilityRow, pressed && styles.rowPressed]}
        >
          <View style={styles.siteIcon}><Ionicons name="business-outline" size={21} color="#2563EB" /></View>
          <View style={styles.utilityCopy}>
            <Text style={styles.utilityTitle}>SITE INFORMATION</Text>
            <Text style={styles.utilitySubtitle} numberOfLines={1}>{activeClockIn?.jobSiteName ?? 'View your assigned job sites'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </Pressable>
        <View style={styles.utilityDivider} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 10, paddingTop: 14, paddingBottom: 14 },
  clockCard: { gap: 16, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, backgroundColor: '#F1F5F9', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  clockStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clockIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: '#E2E8F0' },
  clockIconActive: { backgroundColor: '#DCFCE7' },
  clockCopy: { flex: 1, gap: 4 },
  clockStatusTitle: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0.2, color: '#475569' },
  clockStatusTitleActive: { color: '#15803D' },
  clockStatusMessage: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: '#64748B' },
  clockButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 14, backgroundColor: '#16A34A' },
  buttonDisabled: { backgroundColor: '#E2E8F0' },
  clockButtonText: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.3, color: '#FFFFFF' },
  clockButtonDisabledText: { color: '#64748B' },
  accountCard: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 9, borderWidth: 1, borderColor: FF.borderInput, borderRadius: 19, backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  accountEyebrow: { marginBottom: 7, fontFamily: fonts.medium, fontSize: 10, color: '#94A3B8' },
  accountNameRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountName: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: FF.text },
  signedInPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: '#DCFCE7' },
  signedInText: { fontFamily: fonts.semiBold, fontSize: 9, color: '#15803D' },
  accountDivider: { height: 1, marginTop: 8, backgroundColor: '#F1F5F9' },
  accountActionsRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  accountLabel: { fontFamily: fonts.semiBold, fontSize: 16, color: FF.text },
  refreshButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  refreshText: { fontFamily: fonts.semiBold, fontSize: 13, color: '#2563EB' },
  signOutButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6, borderRadius: 12, backgroundColor: '#DC2626' },
  signOutText: { fontFamily: fonts.semiBold, fontSize: 13, color: '#FFFFFF' },
  utilityCard: { paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: FF.borderInput, borderRadius: 19, backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  utilityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 },
  siteIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EAF2FF' },
  phoneIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#22C55E' },
  utilityCopy: { flex: 1, gap: 3 },
  utilityTitle: { fontFamily: fonts.semiBold, fontSize: 14, color: FF.text },
  utilitySubtitle: { fontFamily: fonts.regular, fontSize: 12, color: '#64748B' },
  phoneNumber: { fontFamily: fonts.medium, fontSize: 13, color: '#2563EB', textDecorationLine: 'underline' },
  utilityDivider: { height: 1, marginLeft: 56, backgroundColor: '#F1F5F9' },
  pressed: { opacity: 0.8 },
  rowPressed: { opacity: 0.75 },
});
