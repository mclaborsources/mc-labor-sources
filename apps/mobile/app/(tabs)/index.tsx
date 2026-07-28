import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HomeHero, MenuTile, Screen, screenLayout } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { mobileApi } from '@/lib/api';
import { FF, accents, cardShadow, fonts, type AccentKey } from '@/theme/brand';

const PRIMARY_ACTIONS: {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: AccentKey;
}[] = [
  { href: '/(tabs)/assignments', label: 'My Assignments', icon: 'briefcase-outline', accent: 'blue' },
  { href: '/(auth)/login', label: 'Sign Out', icon: 'log-out-outline', accent: 'rose' },
];

const WORK_TOOLS: {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: AccentKey;
}[] = [
  { href: '/job-orders', label: 'Job Orders', icon: 'document-text-outline', accent: 'indigo' },
  { href: '/notifications', label: 'Notifications', icon: 'notifications-outline', accent: 'blue' },
  { href: '/safety-bulletins', label: 'Safety Bulletins', icon: 'shield-checkmark-outline', accent: 'amber' },
  { href: '/my-timesheets', label: 'Timesheets', icon: 'calendar-outline', accent: 'violet' },
];

export default function HomeScreen() {
  const { user, signOut } = useAuth();
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
        <Text style={screenLayout.sectionLabel}>Start here</Text>
        <View style={screenLayout.sectionPill}>
          <Ionicons name="sparkles-outline" size={12} color="#2563EB" />
          <Text style={screenLayout.sectionPillText}>Most used</Text>
        </View>
      </View>

      {PRIMARY_ACTIONS.map((item) => (
        <MenuTile
          key={item.href}
          label={item.label}
          icon={item.icon}
          accent={item.accent}
          onPress={
            item.label === 'Sign Out'
              ? async () => {
                  await signOut();
                  router.replace('/(auth)/login');
                }
              : () => router.push(item.href as never)
          }
        />
      ))}

      <View style={[screenLayout.sectionHead, styles.toolsHeading]}>
        <Text style={screenLayout.sectionLabel}>More tools</Text>
      </View>
      <View style={styles.toolsGrid}>
        {WORK_TOOLS.map((item) => {
          const tone = accents[item.accent];
          return (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => [styles.toolCard, pressed && styles.toolCardPressed]}
            >
              <View style={[styles.toolIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                <Ionicons name={item.icon} size={22} color={tone.color} />
              </View>
              <Text style={styles.toolLabel} numberOfLines={2}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={FF.textMuted} style={styles.toolChevron} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolsHeading: {
    marginTop: 10,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolCard: {
    width: '47%',
    minHeight: 112,
    flexGrow: 1,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 9,
    padding: 13,
    paddingRight: 34,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: FF.borderInput,
    backgroundColor: FF.card,
    ...cardShadow,
  },
  toolCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  toolIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  toolLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: FF.text,
  },
  toolChevron: {
    position: 'absolute',
    top: 16,
    right: 12,
  },
});
