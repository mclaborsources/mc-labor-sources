import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { FF, tabScreenOptions } from '@/theme/brand';
import { useAuth } from '@/context/AuthContext';
import { CustomTabBar, LoadingView, TabAppHeader } from '@/components/ui';
import { mobileApi } from '@/lib/api';

export default function TabLayout() {
  const { user, loading } = useAuth();
  const [manualTimesheetEnabled, setManualTimesheetEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (user?.role !== 'WORKER') return;
    let active = true;
    const loadFeatures = () => {
      mobileApi
        .getMobileFeatures()
        .then((features) => {
          if (active) setManualTimesheetEnabled(features.manualTimesheetEnabled);
        })
        .catch(() => {
          if (active) setManualTimesheetEnabled(false);
        });
    };

    loadFeatures();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadFeatures();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [user?.id, user?.role]);

  if (loading || (user?.role === 'WORKER' && manualTimesheetEnabled === null)) return <LoadingView />;

  if (!user || user.role !== 'WORKER') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar {...props} hiddenRoutes={manualTimesheetEnabled ? [] : ['manual']} />
      )}
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        ...tabScreenOptions,
        sceneStyle: { backgroundColor: FF.bg },
        headerShown: true,
        header: (props) => <TabAppHeader {...props} />,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="assignments"
        options={{
          title: 'Assignments',
          tabBarLabel: 'Assignments',
          tabBarIcon: ({ color }) => <Ionicons name="briefcase-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clock"
        options={{
          title: 'Clock',
          tabBarLabel: 'Clock',
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="manual"
        options={{
          title: 'Manual Timesheet',
          tabBarLabel: 'Manual',
          tabBarIcon: ({ color }) => (
            <Ionicons name="document-text-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'Tasks', tabBarLabel: 'Tasks', tabBarIcon: ({ color }) => <Ionicons name="checkbox-outline" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
