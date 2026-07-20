import * as SQLite from 'expo-sqlite';

export const dbPromise = SQLite.openDatabaseAsync('methory.sqlite');

export async function migrate() {
  const db = await dbPromise;
  await db.execAsync(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS self_beliefs (id TEXT PRIMARY KEY NOT NULL, statement TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hypotheses (id TEXT PRIMARY KEY NOT NULL, self_belief_id TEXT NOT NULL, statement TEXT NOT NULL, state TEXT NOT NULL, spec_json TEXT, spec_version TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY NOT NULL, hypothesis_id TEXT, kind TEXT NOT NULL, question_json TEXT NOT NULL, scheduled_at TEXT NOT NULL, response_status TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY NOT NULL, checkin_id TEXT NOT NULL, payload_json TEXT NOT NULL, capture_mode TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY NOT NULL, response_id TEXT NOT NULL, field TEXT NOT NULL, value_json TEXT, certainty TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hypothesis_evaluations (id TEXT PRIMARY KEY NOT NULL, hypothesis_id TEXT NOT NULL, result TEXT NOT NULL, evaluator_version TEXT NOT NULL, evaluated_at TEXT NOT NULL, cohort_metrics_json TEXT NOT NULL, observed_effect REAL, data_quality_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_schedules (id TEXT PRIMARY KEY NOT NULL, checkin_id TEXT NOT NULL, scheduled_at TEXT NOT NULL, notification_id TEXT, status TEXT NOT NULL);
  `);
  return db;
}

export function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
