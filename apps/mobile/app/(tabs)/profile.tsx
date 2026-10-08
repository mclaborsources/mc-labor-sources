import { useState } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorBanner, Screen } from '@/components/ui';
import { accents, fonts, FF } from '@/theme/brand';
import { useAuth } from '@/context/AuthContext';

const QUICK_LINKS = [
  { href: '/(tabs)/assignments', label: 'Job Information', detail: 'Assignments and job details', icon: 'briefcase-outline' as const, accent: 'blue' as const },
  { href: '/(tabs)/clock', label: 'Clock In / Out', detail: 'Manage your working time', icon: 'time-outline' as const, accent: 'green' as const },
  { href: '/(tabs)/messages', label: 'Notifications', detail: 'Messages and updates', icon: 'notifications-outline' as const, accent: 'blue' as const },
  { href: '/my-timesheets', label: 'Timesheets', detail: 'Review your recorded hours', icon: 'calendar-outline' as const, accent: 'violet' as const },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    if (user?.signOutEnabled !== true || signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch {
      setSignOutError('Could not sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const initials = user?.name?.trim().split(/\s+/).filter(Boolean).map((name) => name[0]).slice(0, 2).join('').toUpperCase() || '?';
  const roleLabel = user?.role?.replace(/_/g, ' ').toLowerCase() ?? 'worker';

  return (
    <Screen scroll padded={false} contentContainerStyle={styles.content}>
      <View style={styles.identityCard}>
        <LinearGradient colors={['#2563EB', '#4F46E5']} style={styles.avatar}>
          <Text style={styles.initials}>{initials}</Text>
        </LinearGradient>
        <View style={styles.identityCopy}>
          <Text style={styles.eyebrow}>YOUR PROFILE</Text>
          <Text style={styles.name}>{user?.name ?? 'Worker'}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark-outline" size={12} color="#15803D" />
            <Text style={styles.roleLabel}>{roleLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account details</Text>
        <View style={styles.card}>
          <View style={styles.emailRow}>
            <View style={styles.emailIcon}><Ionicons name="mail-outline" size={19} color="#64748B" /></View>
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Email address</Text>
              <Text selectable style={styles.email}>{user?.email ?? 'Not provided'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick access</Text>
        <View style={styles.card}>
          {QUICK_LINKS.map((link, index) => {
            const tone = accents[link.accent];
            return (
              <Pressable
                key={link.href}
                accessibilityRole="button"
                accessibilityLabel={link.label}
                onPress={() => router.push(link.href as never)}
                style={({ pressed }) => [styles.shortcut, index > 0 && styles.rowBorder, pressed && styles.pressed]}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={link.icon} size={20} color={tone.color} />
                </View>
                <View style={styles.detailCopy}>
                  <Text style={styles.shortcutLabel}>{link.label}</Text>
                  <Text style={styles.shortcutDetail}>{link.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </Pressable>
            );
          })}
        </View>
      </View>

      {user?.signOutEnabled === true ? (
        <View style={styles.signOutSection}>
          {signOutError ? <ErrorBanner message={signOutError} /> : null}
          <Button
            label={signingOut ? 'Signing out…' : 'Sign Out'}
            disabled={signingOut}
            onPress={() => void handleSignOut()}
            variant="danger"
            icon="log-out-outline"
            style={styles.signOut}
          />
        </View>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.footerBrand}>MC LABOR SOURCES</Text>
        <Text style={styles.footerVersion}>Worker app · v1.0</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 22 },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E8EDF3' },
  avatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.bold, fontSize: 24, color: '#FFFFFF' },
  identityCopy: { flex: 1, alignItems: 'flex-start', gap: 6 },
  eyebrow: { fontFamily: fonts.semiBold, fontSize: 9, letterSpacing: 1.2, color: '#64748B' },
  name: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: FF.text },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#F0FDF4' },
  roleLabel: { fontFamily: fonts.semiBold, fontSize: 10, color: '#15803D', textTransform: 'capitalize' },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fonts.semiBold, fontSize: 14, color: '#334155', marginLeft: 2 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EDF3', borderRadius: 18, overflow: 'hidden' },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  emailIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, gap: 4 },
  detailLabel: { fontFamily: fonts.medium, fontSize: 11, color: '#64748B' },
  email: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: FF.text, flexShrink: 1 },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 70 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  shortcutIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { fontFamily: fonts.semiBold, fontSize: 13, color: FF.text },
  shortcutDetail: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 15, color: '#64748B' },
  pressed: { backgroundColor: '#F8FAFC' },
  signOutSection: { gap: 8 },
  signOut: { borderRadius: 14, borderWidth: 1, borderColor: '#DC2626', backgroundColor: '#DC2626' },
  footer: { alignItems: 'center', gap: 5, paddingTop: 2 },
  footerBrand: { fontFamily: fonts.semiBold, fontSize: 9, letterSpacing: 1.3, color: '#94A3B8' },
  footerVersion: { fontFamily: fonts.regular, fontSize: 10, color: '#94A3B8' },
});
