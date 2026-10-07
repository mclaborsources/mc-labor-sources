import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';
import { fonts } from '@/theme/brand';
import { useAuth } from '@/context/AuthContext';

type ActiveClockIn = Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>;

export function ClockStatusBanner() {
  const { user, loading: authLoading } = useAuth();
  const [active, setActive] = useState<ActiveClockIn>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setActive(await mobileApi.getActiveClockIn());
    } catch {
      // Authentication can change while an in-flight refresh is completing.
      // The banner is supplemental and must never block login or navigation.
      setActive(null);
    } finally {
      setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || !user) {
      setActive(null);
      setLoaded(false);
      return;
    }

    void load();
    const unsubscribe = subscribeToMobileRefresh(load);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [authLoading, load, user]);

  if (authLoading || !user || !loaded) return null;

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={[styles.banner, active ? styles.clockedIn : styles.clockedOut]}
    >
      <Text style={styles.text}>
        {active ? 'YOU ARE CLOCKED IN' : 'YOU ARE CLOCKED OUT'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  clockedIn: {
    backgroundColor: '#DCFCE7',
    borderBottomColor: '#15803D',
  },
  clockedOut: {
    backgroundColor: '#FFE4E6',
    borderBottomWidth: 2,
    borderBottomColor: '#FB7185',
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    color: '#000000',
    letterSpacing: 0.5,
  },
  textActive: {
    color: '#FFFFFF',
  },
  textInactive: {
    fontSize: 16,
    color: '#DC2626',
  },
});
