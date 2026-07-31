import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthHero, MenuTile, Screen, screenLayout } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND_PHONE, BRAND_PHONE_HREF, FF, cardShadow, fonts } from '@/theme/brand';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/login');
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <AuthHero signedInName={user?.name ?? 'Worker'} />

      <View style={screenLayout.sectionHead}>
        <Text style={screenLayout.sectionLabel}>Account</Text>
        <View style={screenLayout.sectionPill}>
          <Ionicons name="lock-closed-outline" size={12} color={FF.primary} />
          <Text style={screenLayout.sectionPillText}>Secure access</Text>
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

      <MenuTile
        label="My Timesheets"
        icon="documents-outline"
        accent="blue"
        onPress={() => router.push('/my-timesheets' as never)}
      />

      <MenuTile
        label="Sign Out"
        icon="log-out-outline"
        accent="rose"
        onPress={() => void handleSignOut()}
      />

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

      <Text style={styles.copyright}>© {new Date().getFullYear()} MC Labor Sources Inc.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 22,
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
  copyright: {
    marginTop: 18,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 10,
    color: FF.textMuted,
  },
});
