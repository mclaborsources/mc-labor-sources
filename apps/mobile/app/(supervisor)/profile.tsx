import { Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, DetailRow, ImageBanner, Screen, SectionTitle, screenLayout } from '@/components/ui';
import { fonts, FF } from '@/theme/brand';
import { IMAGERY } from '@/constants/imagery';
import { useAuth } from '@/context/AuthContext';

export default function SupervisorProfileScreen() {
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

  return (
    <Screen scroll padded={false} contentContainerStyle={styles.scroll}>
      <ImageBanner
        variant="full"
        source={IMAGERY.heroProfile}
        title={user?.name ?? 'Supervisor'}
        subtitle="Foreman sign-off account"
      />

      <View style={[screenLayout.body, styles.body]}>
        <View style={styles.avatarWrap}>
          <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark-outline" size={12} color={FF.primary} />
            <Text style={styles.roleText}>Supervisor</Text>
          </View>
        </View>

        <SectionTitle>Account</SectionTitle>
        <Card style={styles.infoCard}>
          <DetailRow icon="mail-outline" label="Email" value={user?.email} />
          <DetailRow icon="person-outline" label="Role" value="Supervisor" />
        </Card>

        <SectionTitle>Mobile access</SectionTitle>
        <Card>
          <Text style={styles.hint}>
            Review pending timesheets on your assigned job sites and capture foreman signatures from the field.
            Full dashboard and reports are available in the web portal.
          </Text>
        </Card>

        <Button label="Safety Acknowledgements" onPress={() => router.push('/safety-acknowledgements')} icon="shield-checkmark-outline" />

        <Button
          label="Sign Out"
          onPress={handleSignOut}
          variant="ghostDanger"
          icon="log-out-outline"
          style={styles.signOut}
        />
        <Text style={styles.footer}>MC Labor Supervisor · v1.0</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 32,
  },
  body: {
    paddingTop: 8,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: '#fff',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
  },
  roleText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: '#B45309',
  },
  infoCard: {
    marginBottom: 8,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: FF.textSecondary,
    lineHeight: 21,
  },
  signOut: {
    marginTop: 24,
  },
  footer: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11,
    color: FF.textMuted,
  },
});
