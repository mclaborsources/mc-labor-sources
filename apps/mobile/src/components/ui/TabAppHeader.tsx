import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { FF, fonts } from '@/theme/brand';
import { BrandHeaderLogo } from './BrandHeaderLogo';
import { ClockStatusBanner } from './ClockStatusBanner';
import { useAuth } from '@/context/AuthContext';

export function TabAppHeader({ options, route }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = typeof options.title === 'string' ? options.title : 'MC Labor';
  const { user, signOut } = useAuth();
  const router = useRouter();
  const showAccountMenu = route.name === 'index' && user?.role === 'WORKER';
  const anchor = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(60);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    if (user?.signOutEnabled !== true || signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
      setMenuOpen(false);
    } catch {
      setSignOutError('Could not sign out. Try again.');
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    if (!showAccountMenu) setMenuOpen(false);
  }, [showAccountMenu]);

  const openMenu = () => {
    setSignOutError('');
    anchor.current?.measureInWindow((_x, y, _width, height) => {
      setMenuTop(y + height + 4);
      setMenuOpen(true);
    });
  };

  return (
    <View>
      <View style={[styles.bar, { paddingTop: (Platform.OS === 'web' ? 0 : insets.top) + 8 }]}>
        <BrandHeaderLogo />
        <View style={styles.copy}>
          <Text style={styles.pageTitle}>{title}</Text>
        </View>
        {showAccountMenu ? (
          <Pressable
            ref={anchor}
            accessibilityRole="button"
            accessibilityLabel="Account menu"
            accessibilityState={{ expanded: menuOpen }}
            onPress={openMenu}
            style={({ pressed }) => [styles.accountIcon, pressed && styles.pressed]}
          >
            <Ionicons name="person-circle-outline" size={32} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>
      <Modal transparent visible={menuOpen && showAccountMenu} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuLayer}>
          <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close account menu" onPress={() => setMenuOpen(false)} />
          <View style={[styles.menu, { top: menuTop }]} accessibilityViewIsModal>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                router.push('/(tabs)/profile');
              }}
              style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
            >
              <Ionicons name="person-outline" size={17} color="#64748B" />
              <Text style={styles.menuText}>Profile</Text>
            </Pressable>
            {user?.signOutEnabled === true ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: signingOut, disabled: signingOut }}
                  disabled={signingOut}
                  onPress={() => void handleSignOut()}
                  style={({ pressed }) => [styles.menuAction, styles.signOutAction, pressed && styles.pressed]}
                >
                  <Ionicons name="log-out-outline" size={17} color="#DC2626" />
                  <Text style={[styles.menuText, styles.signOutText]}>{signingOut ? 'Signing out…' : 'Sign Out'}</Text>
                </Pressable>
                {signOutError ? <Text accessibilityRole="alert" style={styles.menuError}>{signOutError}</Text> : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      <ClockStatusBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  accountIcon: { width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
  menuLayer: { flex: 1 },
  menu: { position: 'absolute', right: 12, width: 175, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
  menuAction: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuText: { fontFamily: fonts.medium, fontSize: 14, color: '#334155' },
  signOutAction: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  signOutText: { color: '#DC2626' },
  menuError: { fontFamily: fonts.regular, fontSize: 12, color: '#DC2626', paddingHorizontal: 12, paddingBottom: 12 },
  bar: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: FF.borderInput,
    backgroundColor: FF.card,
  },
  copy: {
    flex: 1,
  },
  pageTitle: {
    marginTop: 1,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: FF.text,
  },
});
