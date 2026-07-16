import { Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, DetailRow, ImageBanner, NavRow, Screen, SectionTitle, screenLayout } from '@/components/ui';
import { fonts, FF, cardShadow } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';
import { useAuth } from '@/context/AuthContext';

const QUICK_LINKS = [
  { href: '/(tabs)/assignments', label: 'My Assignments', icon: 'briefcase-outline' as const, accent: 'blue' as const },
  { href: '/(tabs)/clock', label: 'Clock In / Out', icon: 'time-outline' as const, accent: 'green' as const },
  { href: '/notifications', label: 'Notifications', icon: 'notifications-outline' as const, accent: 'blue' as const },
  { href: '/my-timesheets', label: 'Timesheets', icon: 'calendar-outline' as const, accent: 'violet' as const },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  const roleLabel = user?.role?.replace(/_/g, ' ') ?? 'Worker';

  return (
    <Screen scroll padded={false} contentContainerStyle={styles.scroll}>
      <ImageBanner
        variant="full"
        source={IMAGERY.heroProfile}
        title={user?.name ?? 'Worker'}
        subtitle="Your worker account"
      />

      <View style={[screenLayout.body, styles.body]}>
        <View style={styles.avatarWrap}>
          <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark-outline" size={12} color={FF.primary} />
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
        </View>

        <SectionTitle>Account</SectionTitle>
        <Card style={styles.infoCard}>
          <DetailRow icon="mail-outline" label="Email" value={user?.email} />
          <DetailRow icon="person-outline" label="Role" value={roleLabel} />
        </Card>

        <SectionTitle>Shortcuts</SectionTitle>
        {QUICK_LINKS.map((link) => (
          <NavRow
            key={link.href}
            label={link.label}
            icon={link.icon}
            accent={link.accent}
            onPress={() => router.push(link.href as never)}
          />
        ))}

        <Button
          label="Sign Out"
          onPress={handleSignOut}
          variant="ghostDanger"
          icon="log-out-outline"
          style={styles.signOut}
        />
        <Text style={styles.footer}>MC Labor Worker · v1.0</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  body: {
    paddingTop: 0,
  },
  avatarWrap: {
    alignItems: 'center',
    marginTop: -48,
    marginBottom: 20,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: FF.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: '#fff',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: FF.blue50,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  roleText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: FF.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCard: {
    paddingVertical: 4,
    marginBottom: 8,
  },
  signOut: {
    marginTop: 8,
  },
  footer: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11,
    color: FF.textMuted,
    marginTop: 16,
  },
});
