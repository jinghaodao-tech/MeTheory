import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
export type NotificationRequest = { title: string; body: string; data: Record<string, unknown>; date: Date };
export type NotificationRecord = { identifier: string; title?: string };
export type NotificationAdapter = { requestPermission: () => Promise<boolean>; schedule: (request: NotificationRequest) => Promise<string>; listScheduled: () => Promise<NotificationRecord[]>; cancel: (identifier: string) => Promise<void>; };
export const expoNotificationAdapter: NotificationAdapter = {
  requestPermission: async () => {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('metheory', { name: 'MeTheory', importance: Notifications.AndroidImportance.DEFAULT, vibrationPattern: [0, 250, 250, 250], lightColor: '#0F766E' });
    return (await Notifications.requestPermissionsAsync()).granted;
  },
  schedule: (request) => Notifications.scheduleNotificationAsync({ content: { title: request.title, body: request.body, data: request.data, ...(Platform.OS === 'android' ? { sound: 'default', channelId: 'metheory' } : {}) }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: request.date } }),
  listScheduled: async () => (await Notifications.getAllScheduledNotificationsAsync()).map((item) => ({ identifier: item.identifier, title: item.content.title ?? undefined })),
  cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
};
