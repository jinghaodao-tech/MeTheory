import { dbPromise, newId } from '../db';

type ScheduledRow = { id: string; scheduled_at: string; notification_id: string | null; status: string };

export async function saveNotificationSchedule(input: { checkinId: string; hypothesisId: string | null; kind: string; scheduledAt: string; expiresAt: string; notificationId: string | null }) {
  const db = await dbPromise;
  await db.runAsync('INSERT INTO notification_schedules (id, checkin_id, hypothesis_id, kind, scheduled_at, expires_at, notification_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId('schedule'), input.checkinId, input.hypothesisId, input.kind, input.scheduledAt, input.expiresAt, input.notificationId, 'scheduled');
}

export async function scheduledSchedules(startIso: string, endIso: string) {
  const db = await dbPromise;
  return db.getAllAsync<ScheduledRow>("SELECT id, scheduled_at, notification_id, status FROM notification_schedules WHERE status = 'scheduled' AND scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at", startIso, endIso);
}

export async function todaySchedules(startIso: string, endIso: string) {
  return scheduledSchedules(startIso, endIso);
}

export async function cancelScheduledRecords() {
  const db = await dbPromise;
  await db.runAsync("UPDATE notification_schedules SET status = 'cancelled', cancelled_at = ? WHERE status = 'scheduled'", new Date().toISOString());
}
