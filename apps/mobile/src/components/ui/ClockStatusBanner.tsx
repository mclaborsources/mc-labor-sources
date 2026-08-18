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
      accessibilityRole="status"
      style={[styles.banner, active ? styles.clockedIn : styles.clockedOut]}
    >
      <Ionicons
        name={active ? 'checkmark-circle' : 'time-outline'}
        size={20}
        color={active ? theme.colors.success : theme.colors.textSecondary}
      />
      <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
        {active
          ? `YOU ARE CLOCKED IN${active.jobSiteName ? ` — ${active.jobSiteName}` : ''}`
          : 'YOU ARE CLOCKED OUT'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  clockedIn: {
    backgroundColor: theme.colors.successBg,
    borderBottomColor: theme.colors.successBorder,
  },
  clockedOut: {
    backgroundColor: '#F8FAFC',
    borderBottomColor: theme.colors.border,
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.35,
  },
  textActive: {
    color: theme.colors.success,
  },
});
