import * as Notifications from 'expo-notifications';
import { createCheckin } from '@/storage/repositories/checkinRepository';
import { trackingHypothesis } from '@/storage/repositories/hypothesisRepository';
import { saveNotificationSchedule, scheduledSchedules, cancelScheduledRecords } from '@/storage/repositories/notificationRepository';
import { getNotificationSettings } from '@/storage/repositories/settingsRepository';
import { chooseDailyMinutes } from './policy';
import { expoNotificationAdapter, type NotificationAdapter } from './adapter';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });
function dayBounds(date = new Date()) { const start = new Date(date); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }; }
const SCHEDULE_HORIZON_DAYS = 30;
export async function scheduleDailyCheckins(seed = Date.now(), adapter: NotificationAdapter = expoNotificationAdapter) {
  const settings = await getNotificationSettings();
  if (!settings.notification_enabled || settings.daily_limit === 0) return [];
  if (!(await adapter.requestPermission())) return [];
  const now = new Date();
  const horizonEnd = dayBounds(new Date(now.getTime() + SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000)).end;
  const existing = await scheduledSchedules(now.toISOString(), horizonEnd.toISOString());
  const hypothesis = await trackingHypothesis();
  const ids: string[] = [];
  for (let day = 0; day < SCHEDULE_HORIZON_DAYS; day += 1) {
    const { start, end } = dayBounds(new Date(now.getTime() + day * 24 * 60 * 60 * 1000));
    const dayExisting = existing.filter((item) => item.scheduled_at >= start.toISOString() && item.scheduled_at < end.toISOString());
    if (dayExisting.length >= settings.daily_limit) continue;
    const occupied = dayExisting.map((item) => { const date = new Date(item.scheduled_at); return date.getHours() * 60 + date.getMinutes(); });
    const dates = chooseDailyMinutes(start, settings, seed + day, occupied).filter((date) => date > now);
    for (const scheduledAt of dates) {
      const checkin = await createCheckin({ kind: 'hypothesis', hypothesisId: hypothesis?.id ?? null, scheduledAt: scheduledAt.toISOString() });
      try {
        const notificationId = await adapter.schedule({ title: 'MeTheory', body: 'Record a short observation.', data: { route: '/checkin', checkinId: checkin.id, hypothesisId: checkin.hypothesisId, kind: checkin.kind, expiresAt: checkin.expiresAt }, date: scheduledAt });
        await saveNotificationSchedule({ checkinId: checkin.id, hypothesisId: checkin.hypothesisId, kind: checkin.kind, scheduledAt: checkin.scheduledAt, expiresAt: checkin.expiresAt, notificationId });
        ids.push(notificationId);
      } catch (error) {
        const { setCheckinStatus } = await import('@/storage/repositories/checkinRepository');
        await setCheckinStatus(checkin.id, 'cancelled', 'notification_schedule_failed');
        throw error;
      }
    }
  }
  return ids;
}
export async function requestMeTheoryNotificationPermission(adapter: NotificationAdapter = expoNotificationAdapter) { return adapter.requestPermission(); }
export async function scheduleNextCheckin(seed = Date.now()) { return scheduleDailyCheckins(seed); }
export async function cancelMeTheoryNotifications(adapter: NotificationAdapter = expoNotificationAdapter) { const scheduled = await adapter.listScheduled(); for (const notification of scheduled) if (notification.title === 'MeTheory') await adapter.cancel(notification.identifier); await cancelScheduledRecords(); }
