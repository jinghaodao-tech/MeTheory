import { dbPromise } from '../db';
export type NotificationSettings = { notification_enabled: boolean; window_start: string; window_end: string; daily_limit: number; minimum_interval_minutes: number; quiet_periods: Array<{ start: string; end: string }> };
export const defaultNotificationSettings: NotificationSettings = { notification_enabled: true, window_start: '08:00', window_end: '22:00', daily_limit: 2, minimum_interval_minutes: 180, quiet_periods: [] };
export async function getSetting<T>(key: string, fallback: T): Promise<T> { const db = await dbPromise; const row = await db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key = ?', key); return row ? JSON.parse(row.value_json) as T : fallback; }
export async function setSetting<T>(key: string, value: T) { const db = await dbPromise; await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)', key, JSON.stringify(value), new Date().toISOString()); }
export async function getNotificationSettings() { return getSetting('notification_settings', defaultNotificationSettings); }
