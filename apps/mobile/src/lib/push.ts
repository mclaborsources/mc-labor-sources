import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { Router } from 'expo-router';
import { supabase } from './supabase';
import { requestMobileRefresh } from './mobile-refresh';

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

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

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

export function setupNotificationResponseHandler(
  router: Router,
  role?: string,
): () => void {
  let active = true;
  let subscription: { remove: () => void } | undefined;
  let receivedSubscription: { remove: () => void } | undefined;
  let lastHandledIdentifier: string | undefined;

  void getNotifications().then((Notifications) => {
    if (!active || !Notifications) return;
    receivedSubscription = Notifications.addNotificationReceivedListener(() => { void requestMobileRefresh(); });
    const handleResponse = (response: import('expo-notifications').NotificationResponse) => {
      if (!active) return;
      const identifier = response.notification.request.identifier;
      if (identifier === lastHandledIdentifier) return;
      lastHandledIdentifier = identifier;
      const data = response.notification.request.content.data as Record<string, string>;
      if (data.notificationId && role === 'WORKER') {
        router.push({ pathname: '/(tabs)/messages', params: { notificationId: data.notificationId } });
      } else if (data.type === 'JOB_ORDER' && data.id) {
        router.push(`/job-orders/${data.id}`);
      } else if (data.type === 'SAFETY') {
        router.push('/safety-bulletins');
      } else if (data.type === 'TIMESHEET_SIGNED' || data.type === 'TIMESHEET_SENT') {
        router.push(role === 'SUPERVISOR' ? '/(supervisor)/timesheets' : '/my-timesheets');
      } else if (data.type === 'MESSAGE' && data.id) {
        router.push(`/messages/${data.id}`);
      } else {
        router.push('/notifications');
      }
    };
    subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      }
    }).catch(() => undefined);
  });

  return () => {
    active = false;
    subscription?.remove();
    receivedSubscription?.remove();
  };
}
