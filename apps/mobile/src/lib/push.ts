import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { Router } from 'expo-router';
import { supabase } from './supabase';

type NotificationsModule = typeof import('expo-notifications');

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let notificationsPromise: Promise<NotificationsModule | null> | null = null;

function getNotifications(): Promise<NotificationsModule | null> {
  if (isExpoGo) return Promise.resolve(null);

  notificationsPromise ??= import('expo-notifications').then((notifications) => {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    return notifications;
  });

  return notificationsPromise;
}

export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Device.isDevice) return;
  const Notifications = await getNotifications();
  if (!Notifications) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  const platform =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  const { error } = await supabase.from('push_device_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: tokenData.data,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' },
  );

  if (error) throw error;
}

export function setupNotificationResponseHandler(router: Router): () => void {
  let active = true;
  let subscription: { remove: () => void } | undefined;

  void getNotifications().then((Notifications) => {
    if (!active || !Notifications) return;
    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (data.type === 'JOB_ORDER' && data.id) {
        router.push(`/job-orders/${data.id}`);
      } else if (data.type === 'SAFETY') {
        router.push('/safety-bulletins');
      } else if (data.type === 'TIMESHEET_SIGNED' || data.type === 'TIMESHEET_SENT') {
        router.push('/timesheets');
      } else if (data.type === 'MESSAGE' && data.id) {
        router.push(`/messages/${data.id}`);
      } else {
        router.push('/notifications');
      }
    });
  });

  return () => {
    active = false;
    subscription?.remove();
  };
}
