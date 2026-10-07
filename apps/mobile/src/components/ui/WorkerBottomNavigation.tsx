import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import { usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';
import { FF } from '@/theme/brand';
import { mobileTabStyles as styles } from './CustomTabBar';

type Features = Awaited<ReturnType<typeof mobileApi.getMobileFeatures>>;
const tabs = [
  { name: 'index', label: 'Home', icon: 'home-outline', feature: null },
  { name: 'assignments', label: 'Assignments', icon: 'briefcase-outline', feature: 'assignmentsEnabled' },
  { name: 'manual', label: 'Manual', icon: 'document-text-outline', feature: 'manualTimesheetEnabled' },
  { name: 'tasks', label: 'Tasks', icon: 'checkbox-outline', feature: 'tasksEnabled' },
  { name: 'safety-bulletins', label: 'Safety', icon: 'shield-checkmark-outline', feature: 'safetyBulletinsEnabled' },
  { name: 'messages', label: 'Messages', icon: 'chatbubbles-outline', feature: 'messagesEnabled' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', feature: 'profileEnabled' },
] as const;

/** The worker tab destinations for screens presented above the tab navigator. */
export function WorkerBottomNavigation({ detailOnly = false, onNavigate }: {
  detailOnly?: boolean;
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [features, setFeatures] = useState<Features | null>(null);
  const hidden = detailOnly && (!segments.length || segments[0] === '(tabs)' || segments[0] === '(auth)');

  useEffect(() => {
    if (user?.role !== 'WORKER' || hidden) return;
    let mounted = true;
    const load = async () => {
      try {
        const result = await mobileApi.getMobileFeatures();
        if (mounted) setFeatures(result);
      } catch {
        // Match the main tab navigator's defaults when features cannot refresh.
        if (mounted) setFeatures({ assignmentsEnabled: true, clockEnabled: true,
          previousWeekEnabled: false, nextWeekEnabled: false, manualTimesheetEnabled: false,
          tasksEnabled: false, messagesEnabled: true, profileEnabled: false, safetyBulletinsEnabled: true });
      }
    };
    void load();
    const unsubscribe = subscribeToMobileRefresh(load);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    return () => { mounted = false; unsubscribe(); subscription.remove(); };
  }, [hidden, user?.id, user?.role]);

  if (hidden || user?.role !== 'WORKER' || !features) return null;
  const activeTab = /\/(assignments|job-orders|my-timesheets|manual-timesheet)(\/|$)/.test(pathname)
    ? 'assignments' : pathname.includes('safety') ? 'safety-bulletins'
    : /\/(messages|notifications)(\/|$)/.test(pathname) ? 'messages'
    : pathname.includes('tasks') ? 'tasks' : pathname.includes('profile') ? 'profile' : 'index';

  return <View style={{ backgroundColor: FF.bg, flexShrink: 0, paddingTop: 6 }}>
    <View style={[styles.bar, { paddingBottom: Platform.OS === 'web' ? 10 : Math.max(insets.bottom, 8) }]}>
      {tabs.filter((tab) => !tab.feature || features[tab.feature]).map((tab) => {
        const focused = tab.name === activeTab;
        const color = focused ? '#15803D' : FF.textMuted;
        return <Pressable key={tab.name} accessibilityRole="button" accessibilityLabel={tab.label}
          accessibilityState={{ selected: focused }}
          onPress={() => {
            onNavigate?.();
            router.dismissTo((tab.name === 'index' ? '/(tabs)' : `/(tabs)/${tab.name}`) as Href);
          }}
          style={({ pressed }) => [styles.tab, focused && styles.tabActive, pressed && styles.tabPressed]}>
          <Ionicons name={tab.icon} size={22} color={color} />
          <Text style={[styles.label, { color }]} numberOfLines={1}>{tab.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
