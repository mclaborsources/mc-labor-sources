import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';
import { fonts, theme } from '@/theme/brand';

type ActiveClockIn = Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>;

export function ClockStatusBanner() {
  const [active, setActive] = useState<ActiveClockIn>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setActive(await mobileApi.getActiveClockIn());
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToMobileRefresh(load);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [load]);

  if (!loaded) return null;

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={[styles.banner, active ? styles.clockedIn : styles.clockedOut]}
    >
      <Ionicons
        name={active ? 'checkmark-circle' : 'time-outline'}
        size={active ? 22 : 24}
        color={active ? '#FFFFFF' : '#DC2626'}
      />
      <Text style={[styles.text, active ? styles.textActive : styles.textInactive]} numberOfLines={1}>
        {active
          ? `YOU ARE CLOCKED IN${active.jobSiteName ? ` — ${active.jobSiteName}` : ''}`
          : 'YOU ARE CLOCKED OUT'}
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
    backgroundColor: theme.colors.success,
    borderBottomColor: '#15803D',
  },
  clockedOut: {
    backgroundColor: '#FFE4E6',
    borderBottomWidth: 2,
    borderBottomColor: '#FB7185',
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 15,
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
