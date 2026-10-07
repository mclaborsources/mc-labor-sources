import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';
import { fonts } from '@/theme/brand';
import { useAuth } from '@/context/AuthContext';
import { officeWeekStart } from '@/lib/workweek-preview';

type ActiveClockIn = Awaited<ReturnType<typeof mobileApi.getActiveClockIn>>;

export function ClockStatusBanner() {
  const { user, loading: authLoading } = useAuth();
  const [active, setActive] = useState<ActiveClockIn>(null);
  const [loaded, setLoaded] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(officeWeekStart);

  const load = useCallback(async () => {
    if (!user) return;
    setCurrentWeek(officeWeekStart());
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

    const unsubscribe = subscribeToMobileRefresh(load);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [authLoading, load, user]);

  useFocusEffect(useCallback(() => {
    if (!authLoading && user) void load();
  }, [authLoading, load, user]));

  if (authLoading || !user) return null;
  const weekStart = new Date(`${currentWeek}T12:00:00`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.banner}
    >
      <View style={styles.statusCopy}>
        <Text style={[styles.text, loaded && !active && styles.textInactive]}>
          {!loaded ? 'CHECKING CLOCK STATUS' : active ? 'YOU ARE CLOCKED IN' : 'YOU ARE CLOCKED OUT'}
        </Text>
        <Text style={styles.message}>
          {!loaded ? 'Checking your current shift…' : active
            ? `You are working${active.jobSiteName ? ` at ${active.jobSiteName}` : ''}.`
            : 'You are currently clocked out.'}
        </Text>
      </View>
      <View style={styles.workWeekCard}>
        <View style={styles.workWeekIcon}><Ionicons name="calendar-outline" size={18} color="#15803D" /></View>
        <View style={styles.workWeekCopy}>
          <Text style={styles.workWeekLabel}>CURRENT WORK WEEK</Text>
          <Text style={styles.workWeekDates}>{formatDate(weekStart)} – {formatDate(weekEnd)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 11,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D1EBDD',
    borderRadius: 18,
    backgroundColor: '#EAF8EF',
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    color: '#000000',
    letterSpacing: 0.5,
  },
  textInactive: {
    color: '#DC2626',
  },
  statusCopy: { gap: 4 },
  message: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, textAlign: 'center', color: '#64748B' },
  workWeekCard: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 13, backgroundColor: '#FFFFFF' },
  workWeekIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#DCFCE7' },
  workWeekCopy: { flex: 1, gap: 3 },
  workWeekLabel: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.65, color: '#000000' },
  workWeekDates: { fontFamily: fonts.semiBold, fontSize: 13, color: '#111827' },
});
