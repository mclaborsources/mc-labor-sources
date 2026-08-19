import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthHero, Button, MenuTile, ModalSheet, Screen, screenLayout } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND_PHONE, BRAND_PHONE_HREF, FF, cardShadow, fonts } from '@/theme/brand';
import { requestMobileRefresh } from '@/lib/mobile-refresh';

export default function HomeScreen() {
  const { user, refresh, signOut } = useAuth();
  const router = useRouter();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [refreshingApp, setRefreshingApp] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      setSignOutOpen(false);
      router.replace('/(auth)/login');
    } finally {
      setSigningOut(false);
    }
  }

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
      <View>
        <View style={styles.heroWrap}>
          <AuthHero signedInName={user?.name ?? 'Worker'} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => setSignOutOpen(true)}
            style={({ pressed }) => [styles.signOutAction, pressed && styles.pressed]}
          >
            <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={screenLayout.sectionHead}>
          <Text style={screenLayout.sectionLabel}>Account</Text>
          <View style={styles.sectionActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh app data"
              accessibilityState={{ busy: refreshingApp, disabled: refreshingApp }}
              disabled={refreshingApp}
              onPress={() => void handleRefresh()}
              style={({ pressed }) => [
                styles.refreshButton,
                pressed && !refreshingApp && styles.pressed,
              ]}
            >
              {refreshingApp ? (
                <ActivityIndicator size="small" color={FF.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={17} color={FF.primary} />
              )}
              <Text style={styles.refreshButtonText}>
                {refreshingApp ? 'Refreshing' : 'Refresh'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.accountCard}>
          <View style={styles.accountIcon}>
            <Ionicons name="person-outline" size={21} color={FF.primary} />
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{user?.name ?? 'Worker'}</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>{user?.email}</Text>
          </View>
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Signed in</Text>
          </View>
        </View>
      </View>

      <View style={styles.siteInformationSection}>
        <MenuTile
          label="SITE INFORMATION"
          icon="business-outline"
          accent="blue"
          onPress={() => router.push('/(tabs)/assignments' as never)}
        />
      </View>

      <View style={styles.helpSection}>
        <Pressable
          onPress={() => Linking.openURL(BRAND_PHONE_HREF)}
          style={({ pressed }) => [styles.helpCard, pressed && styles.pressed, cardShadow]}
        >
          <View style={styles.helpIcon}>
            <Ionicons name="call-outline" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.helpCopy}>
            <Text style={styles.helpLabel}>Need help?</Text>
            <Text style={styles.helpPhone}>{BRAND_PHONE}</Text>
          </View>
          <View style={styles.helpArrow}>
            <Ionicons name="chevron-forward" size={15} color="#16A34A" />
          </View>
        </Pressable>
      </View>

      <ModalSheet
        visible={signOutOpen}
        title="Sign out?"
        onClose={() => setSignOutOpen(false)}
        dismissOnBackdrop={!signingOut}
        footer={
          <View style={styles.signOutModalActions}>
            <Button
              label="Cancel"
              variant="ghost"
              disabled={signingOut}
              style={styles.signOutModalButton}
              onPress={() => setSignOutOpen(false)}
            />
            <Button
              label="Sign Out"
              variant="danger"
              icon="log-out-outline"
              loading={signingOut}
              style={styles.signOutModalButton}
              onPress={() => void handleSignOut()}
            />
          </View>
        }
      >
        <Text style={styles.signOutModalMessage}>
          Are you sure you want to sign out of the employee app?
        </Text>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 10,
  },
  siteInformationSection: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 150,
    paddingVertical: 24,
  },
  helpSection: {
    marginTop: 'auto',
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  refreshButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
  },
  refreshButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: FF.primary,
  },
  accountCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: FF.borderInput,
    borderRadius: 18,
    backgroundColor: FF.card,
    ...cardShadow,
  },
  accountIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: FF.blue50,
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: FF.text,
  },
  accountEmail: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: FF.textSecondary,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F0FDF4',
  },
  heroWrap: {
    position: 'relative',
  },
  signOutAction: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 999,
    backgroundColor: '#E11D48',
    shadowColor: '#881337',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  signOutText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  signOutModalMessage: {
    paddingVertical: 6,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    color: FF.textSecondary,
  },
  signOutModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  signOutModalButton: {
    flex: 1,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  activeText: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    color: '#15803D',
  },
  helpCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderWidth: 1,
    borderColor: FF.border,
    borderRadius: 18,
    backgroundColor: FF.card,
  },
  helpIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#16A34A',
  },
  helpCopy: {
    flex: 1,
  },
  helpLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: FF.textMuted,
  },
  helpPhone: {
    marginTop: 2,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: FF.text,
  },
  helpArrow: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
  },
  pressed: {
    opacity: 0.86,
  },
});
