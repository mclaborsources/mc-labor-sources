import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { FF, tabScreenOptions } from '@/theme/brand';
import { useAuth } from '@/context/AuthContext';
import { CustomTabBar, LoadingView, TabAppHeader } from '@/components/ui';

export default function SupervisorTabLayout() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingView />;

  if (!user || user.role !== 'SUPERVISOR') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
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
        name="timesheets"
        options={{
          title: 'Timesheets',
          tabBarLabel: 'Timesheets',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="clipboard-outline" size={22} color={color} />,
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
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
