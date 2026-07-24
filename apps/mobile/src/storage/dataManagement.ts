import { dbPromise } from './db';

const DATA_TABLES = ['app_settings', 'self_beliefs', 'hypotheses', 'checkins', 'responses', 'observations', 'hypothesis_evaluations', 'hypothesis_evaluation_samples', 'notification_schedules', 'user_parameter_settings', 'observation_episodes', 'parameter_values', 'hypothesis_parameter_requirements', 'generated_questions', 'hypothesis_candidates', 'external_import_batches', 'external_import_items', 'ai_access_audit_logs'] as const;

export async function exportLocalData() {
  const db = await dbPromise;
  const data: Record<string, unknown[]> = {};
  for (const table of DATA_TABLES) data[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
  return JSON.stringify({ exportedAt: new Date().toISOString(), schema: 'metheory-mobile-v1', data }, null, 2);
}

export async function clearLocalData() {
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    for (const table of [...DATA_TABLES].reverse()) await db.runAsync(`DELETE FROM ${table}`);
  });
}
