import { dbPromise, newId } from './db';

export type HomeData = { belief: { statement: string } | null; hypothesis: { statement: string; state: string } | null; evaluations: number; recentCheckins: number };

export async function saveSetup(statement: string) {
  const db = await dbPromise;
  const beliefId = newId('belief');
  const hypothesisId = newId('hyp');
  const now = new Date().toISOString();
  await db.runAsync('INSERT INTO self_beliefs (id, statement, created_at) VALUES (?, ?, ?)', beliefId, statement, now);
  await db.runAsync('INSERT INTO hypotheses (id, self_belief_id, statement, state, created_at) VALUES (?, ?, ?, ?, ?)', hypothesisId, beliefId, statement, 'tracking', now);
  await db.runAsync('INSERT OR REPLACE INTO app_settings (key, value_json) VALUES (?, ?)', 'onboarding_complete', 'true');
  return hypothesisId;
}

export async function isOnboardingComplete() {
  const db = await dbPromise;
  const row = await db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key = ?', 'onboarding_complete');
  return row?.value_json === 'true';
}

export async function getHomeData(): Promise<HomeData> {
  const db = await dbPromise;
  const belief = await db.getFirstAsync<{ statement: string }>('SELECT statement FROM self_beliefs ORDER BY created_at DESC LIMIT 1');
  const hypothesis = await db.getFirstAsync<{ statement: string; state: string }>('SELECT statement, state FROM hypotheses ORDER BY created_at DESC LIMIT 1');
  const evaluations = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM hypothesis_evaluations');
  const recentCheckins = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM checkins WHERE scheduled_at >= datetime('now', '-7 days')");
  return { belief: belief ?? null, hypothesis: hypothesis ?? null, evaluations: evaluations?.count ?? 0, recentCheckins: recentCheckins?.count ?? 0 };
}

export async function createCheckin() {
  const db = await dbPromise;
  const id = newId('checkin');
  const question = { title: '今の活動を記録する', fields: ['activity_type', 'started', 'completed', 'energy'] };
  await db.runAsync('INSERT INTO checkins (id, kind, question_json, scheduled_at) VALUES (?, ?, ?, ?)', id, 'manual', JSON.stringify(question), new Date().toISOString());
  return { id, ...question };
}

export async function saveResponse(checkinId: string, payload: Record<string, unknown>) {
  const db = await dbPromise;
  const responseId = newId('response');
  const now = new Date().toISOString();
  await db.runAsync('INSERT INTO responses (id, checkin_id, payload_json, capture_mode, created_at) VALUES (?, ?, ?, ?, ?)', responseId, checkinId, JSON.stringify(payload), 'momentary_observation', now);
  for (const [field, value] of Object.entries(payload)) {
    await db.runAsync('INSERT INTO observations (id, response_id, field, value_json, certainty, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId('obs'), responseId, field, JSON.stringify(value), 'high', 'user_confirmed', now);
  }
  await db.runAsync("UPDATE checkins SET response_status = 'answered' WHERE id = ?", checkinId);
}

export async function listEvaluations() {
  const db = await dbPromise;
  return db.getAllAsync<{ id: string; result: string; observed_effect: number | null; evaluated_at: string; cohort_metrics_json: string }>('SELECT * FROM hypothesis_evaluations ORDER BY evaluated_at DESC');
}
