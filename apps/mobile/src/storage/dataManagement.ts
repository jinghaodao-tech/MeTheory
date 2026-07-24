import { dbPromise } from './db';

const DATA_TABLES = ['app_settings', 'self_beliefs', 'hypotheses', 'checkins', 'responses', 'observations', 'hypothesis_evaluations', 'hypothesis_evaluation_samples', 'notification_schedules', 'user_parameter_settings', 'observation_episodes', 'parameter_values', 'hypothesis_parameter_requirements', 'generated_questions', 'hypothesis_candidates', 'external_import_batches', 'external_import_items', 'ai_access_audit_logs'] as const;

export async function exportLocalData() {
  const db = await dbPromise;
  const data: Record<string, unknown[]> = {};
  for (const table of DATA_TABLES) data[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
  return JSON.stringify({ exportedAt: new Date().toISOString(), schema: 'metheory-mobile-v1', data }, null, 2);
}

export async function deleteParameterData(input: { userId: string; parameterIds: string[] }) {
  const db = await dbPromise;
  if (!input.parameterIds.length) return;
  const placeholders = input.parameterIds.map(() => '?').join(',');
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM generated_questions WHERE user_id=? AND parameter_id IN (${placeholders})`, input.userId, ...input.parameterIds);
    await db.runAsync(`DELETE FROM user_parameter_settings WHERE user_id=? AND parameter_id IN (${placeholders})`, input.userId, ...input.parameterIds);
    await db.runAsync(`DELETE FROM parameter_values WHERE parameter_id IN (${placeholders}) AND episode_id IN (SELECT id FROM observation_episodes WHERE user_id=?)`, ...input.parameterIds, input.userId);
    await db.runAsync('DELETE FROM observation_episodes WHERE user_id=? AND NOT EXISTS (SELECT 1 FROM parameter_values WHERE episode_id=observation_episodes.id)', input.userId);
  });
}

export async function deleteDataByPeriod(input: { userId: string; startAt: string; endAt: string }) {
  if (new Date(input.startAt) >= new Date(input.endAt)) throw new Error('invalid_period');
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM parameter_values WHERE observed_at>=? AND observed_at<? AND episode_id IN (SELECT id FROM observation_episodes WHERE user_id=?)', input.startAt, input.endAt, input.userId);
    await db.runAsync('DELETE FROM generated_questions WHERE user_id=? AND created_at>=? AND created_at<?', input.userId, input.startAt, input.endAt);
    await db.runAsync('DELETE FROM observation_episodes WHERE user_id=? AND observed_at>=? AND observed_at<? AND NOT EXISTS (SELECT 1 FROM parameter_values WHERE episode_id=observation_episodes.id)', input.userId, input.startAt, input.endAt);
  });
}

export async function disconnectExternalSources(userId: string) {
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE user_parameter_settings SET cloud_sync_enabled=0, external_ai_enabled=0, raw_value_access_enabled=0, updated_at=? WHERE user_id=?", new Date().toISOString(), userId);
    await db.runAsync('DELETE FROM external_import_items WHERE batch_id IN (SELECT id FROM external_import_batches WHERE user_id=?)', userId);
    await db.runAsync('DELETE FROM external_import_batches WHERE user_id=?', userId);
  });
}

export async function clearLocalData() {
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    for (const table of [...DATA_TABLES].reverse()) await db.runAsync(`DELETE FROM ${table}`);
  });
}
