import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { FF, tabScreenOptions } from '@/theme/brand';
import { useAuth } from '@/context/AuthContext';
import { CustomTabBar, LoadingView, TabAppHeader } from '@/components/ui';
import { mobileApi } from '@/lib/api';
import { subscribeToMobileRefresh } from '@/lib/mobile-refresh';

export default function TabLayout() {
  const { user, loading } = useAuth();
  const [mobileFeatures, setMobileFeatures] = useState<
    Awaited<ReturnType<typeof mobileApi.getMobileFeatures>> | null
  >(null);

  useEffect(() => {
    if (user?.role !== 'WORKER') return;
    let active = true;
    const loadFeatures = () => {
      mobileApi
        .getMobileFeatures()
        .then((features) => {
          if (active) setMobileFeatures(features);
        })
        .catch(() => {
          if (active) {
            setMobileFeatures({
              assignmentsEnabled: true,
              clockEnabled: true,
              previousWeekEnabled: false,
              manualTimesheetEnabled: false,
              tasksEnabled: false,
              messagesEnabled: false,
              profileEnabled: false,
            });
          }
        });
    };

    loadFeatures();
    const unsubscribeRefresh = subscribeToMobileRefresh(loadFeatures);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadFeatures();
    });

    return () => {
      active = false;
      unsubscribeRefresh();
      subscription.remove();
    };
  }, [user?.id, user?.role]);

  if (loading || (user?.role === 'WORKER' && mobileFeatures === null)) return <LoadingView />;

  if (!user || user.role !== 'WORKER') {
    return <Redirect href="/(auth)/login" />;
  }

  const hiddenRoutes = [
    'clock',
    !mobileFeatures?.assignmentsEnabled && 'assignments',
    !mobileFeatures?.manualTimesheetEnabled && 'manual',
    !mobileFeatures?.tasksEnabled && 'tasks',
    !mobileFeatures?.messagesEnabled && 'messages',
    !mobileFeatures?.profileEnabled && 'profile',
  ].filter((route): route is string => Boolean(route));

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar {...props} hiddenRoutes={hiddenRoutes} />
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
          title: 'Assignments / Site Information',
          tabBarLabel: 'Assignments / Site Information',
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
