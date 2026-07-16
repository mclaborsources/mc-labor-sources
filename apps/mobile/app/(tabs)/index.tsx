import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HomeHero, MenuTile, Screen, screenLayout } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { mobileApi } from '@/lib/api';
import { type AccentKey } from '@/theme/brand';

const MENU: {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: AccentKey;
}[] = [
  { href: '/(tabs)/assignments', label: 'My Assignments', icon: 'briefcase-outline', accent: 'blue' },
  { href: '/(tabs)/clock', label: 'Clock In / Out', icon: 'time-outline', accent: 'green' },
  { href: '/job-orders', label: 'Job Orders', icon: 'document-text-outline', accent: 'indigo' },
  { href: '/notifications', label: 'Notifications', icon: 'notifications-outline', accent: 'blue' },
  { href: '/safety-bulletins', label: 'Safety Bulletins', icon: 'shield-checkmark-outline', accent: 'amber' },
  { href: '/my-timesheets', label: 'Timesheets', icon: 'calendar-outline', accent: 'violet' },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const firstName = user?.name?.split(' ')[0] ?? 'Worker';
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [onShift, setOnShift] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const [assignments, active] = await Promise.all([
        mobileApi.getAssignments(),
        mobileApi.getActiveClockIn(),
      ]);
      setAssignmentCount(assignments.length);
      setOnShift(Boolean(active));
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return (
    <Screen scroll>
      <HomeHero firstName={firstName} assignmentCount={assignmentCount} onShift={onShift} />

      <View style={screenLayout.sectionHead}>
        <Text style={screenLayout.sectionLabel}>Quick access</Text>
        <View style={screenLayout.sectionPill}>
          <Ionicons name="sparkles-outline" size={12} color="#2563EB" />
          <Text style={screenLayout.sectionPillText}>Tap to open</Text>
        </View>
      </View>

      {MENU.map((item) => (
        <MenuTile
          key={item.href}
          label={item.label}
          icon={item.icon}
          accent={item.accent}
          onPress={() => router.push(item.href as never)}
        />
      ))}
    </Screen>
  );
}
