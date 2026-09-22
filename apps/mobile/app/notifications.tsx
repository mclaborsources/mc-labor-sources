import { Redirect, useLocalSearchParams } from 'expo-router';
import { NotificationHistoryScreen } from '@/components/NotificationHistoryScreen';
import { LoadingView } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function NotificationsScreen() {
  const { user, loading } = useAuth();
  const { notificationId } = useLocalSearchParams<{ notificationId?: string }>();

  if (loading) return <LoadingView />;
  if (user?.role === 'WORKER') {
    return <Redirect href={{ pathname: '/(tabs)/messages', params: notificationId ? { notificationId } : {} }} />;
  }

  return <NotificationHistoryScreen standalone />;
}
