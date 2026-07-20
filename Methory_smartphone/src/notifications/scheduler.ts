import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });
export async function scheduleDailyCheckin() {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  return Notifications.scheduleNotificationAsync({ content: { title: 'Methory', body: '今の自分を短く観察してみませんか？', data: { route: '/checkin' } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 19, minute: 0 } });
}
