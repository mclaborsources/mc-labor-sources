import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { headerScreenOptions } from '@/theme/brand';
import { AuthProvider } from '@/context/AuthContext';
import { NotificationBootstrap } from '@/components/NotificationBootstrap';

export default function RootLayout() {
  const [loaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <NotificationBootstrap />
      <StatusBar style="dark" />
      <Stack screenOptions={headerScreenOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(supervisor)" options={{ headerShown: false }} />
        <Stack.Screen name="assignments" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="job-orders" options={{ headerShown: false }} />
        <Stack.Screen name="my-timesheets" options={{ headerShown: false }} />
        <Stack.Screen name="safety-bulletins" options={{ headerShown: false }} />
        <Stack.Screen name="messages" options={{ headerShown: false }} />
        <Stack.Screen name="safety-acknowledgements" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
