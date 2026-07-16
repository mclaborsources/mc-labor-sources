import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { setupNotificationResponseHandler } from '@/lib/push';
import { useAuth } from '@/context/AuthContext';

export function NotificationBootstrap() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    return setupNotificationResponseHandler(router, user?.role);
  }, [router, user?.role]);

  return null;
}
