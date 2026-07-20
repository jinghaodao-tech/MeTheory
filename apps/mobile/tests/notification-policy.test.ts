import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseFutureMinute, isAllowedMinute } from '../src/notifications/policy.ts';
import type { NotificationSettings } from '../src/storage/repositories/settingsRepository.ts';

const settings: NotificationSettings = { notification_enabled: true, window_start: '08:00', window_end: '22:00', daily_limit: 2, minimum_interval_minutes: 180, quiet_periods: [{ start: '12:00', end: '13:00' }] };
test('notification policy excludes outside and quiet periods', () => { assert.equal(isAllowedMinute(7 * 60 + 30, settings), false); assert.equal(isAllowedMinute(12 * 60 + 30, settings), false); assert.equal(isAllowedMinute(15 * 60, settings), true); });
test('fixed seed produces a future minute respecting interval', () => { const first = chooseFutureMinute(7, new Date('2026-07-20T08:00:00'), settings, []); const second = chooseFutureMinute(7, new Date('2026-07-20T08:00:00'), settings, [first ?? 0]); assert.notEqual(first, null); assert.notEqual(second, first); });
