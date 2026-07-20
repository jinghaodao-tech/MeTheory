import * as SQLite from 'expo-sqlite';

export const dbPromise = SQLite.openDatabaseAsync('metheory.sqlite');
export const SCHEMA_VERSION = 4;

const migrations: Record<number, string> = {
  1: `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS self_beliefs (id TEXT PRIMARY KEY NOT NULL, statement TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hypotheses (id TEXT PRIMARY KEY NOT NULL, self_belief_id TEXT NOT NULL, template_key TEXT NOT NULL, statement TEXT NOT NULL, state TEXT NOT NULL, spec_json TEXT NOT NULL, spec_version TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY NOT NULL, hypothesis_id TEXT, kind TEXT NOT NULL, question_json TEXT NOT NULL, scheduled_at TEXT NOT NULL, expires_at TEXT NOT NULL, response_status TEXT NOT NULL DEFAULT 'pending', missing_reason TEXT, policy_version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY NOT NULL, checkin_id TEXT NOT NULL, payload_json TEXT NOT NULL, capture_mode TEXT NOT NULL, missing_reason TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY NOT NULL, response_id TEXT NOT NULL, field TEXT NOT NULL, value_json TEXT, certainty TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hypothesis_evaluations (id TEXT PRIMARY KEY NOT NULL, hypothesis_id TEXT NOT NULL, hypothesis_spec_version TEXT NOT NULL, evaluator_version TEXT NOT NULL, evaluated_at TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL, result TEXT NOT NULL, cohort_metrics_json TEXT NOT NULL, observed_effect REAL, required_effect REAL NOT NULL, data_quality_json TEXT NOT NULL, sample_size INTEGER NOT NULL, missing_count INTEGER NOT NULL, excluded_count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS hypothesis_evaluation_samples (id TEXT PRIMARY KEY NOT NULL, evaluation_id TEXT NOT NULL, response_id TEXT NOT NULL, cohort_key TEXT, included INTEGER NOT NULL, outcome_json TEXT, exclusion_reason TEXT);
      CREATE TABLE IF NOT EXISTS notification_schedules (id TEXT PRIMARY KEY NOT NULL, checkin_id TEXT NOT NULL, hypothesis_id TEXT, kind TEXT NOT NULL, scheduled_at TEXT NOT NULL, expires_at TEXT NOT NULL, notification_id TEXT, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);`,
  2: `ALTER TABLE checkins ADD COLUMN manual_source TEXT DEFAULT 'app';`,
  3: `ALTER TABLE app_settings ADD COLUMN updated_at TEXT;`,
  4: `CREATE INDEX IF NOT EXISTS idx_observations_response ON observations(response_id); CREATE INDEX IF NOT EXISTS idx_evaluations_hypothesis ON hypothesis_evaluations(hypothesis_id, evaluated_at);`,
};

export async function migrate() {
  const db = await dbPromise;
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);');
  const applied = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  const current = new Set(applied.map((row) => row.version));
  for (let version = 1; version <= SCHEMA_VERSION; version += 1) {
    if (current.has(version)) continue;
    try { await db.execAsync(migrations[version]); } catch (error) {
      if (version > 1 && !(String(error).includes('duplicate column') || String(error).includes('already exists'))) throw error;
    }
    await db.runAsync('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)', version, new Date().toISOString());
  }
  const ensureColumn = async (table: string, column: string, definition: string) => { const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`); if (!columns.some((item) => item.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); };
  await ensureColumn('hypotheses', 'template_key', "TEXT NOT NULL DEFAULT 'time_of_day_productivity'");
  await ensureColumn('hypotheses', 'spec_json', "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn('hypotheses', 'spec_version', "TEXT NOT NULL DEFAULT '1'");
  await ensureColumn('checkins', 'expires_at', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('checkins', 'missing_reason', 'TEXT');
  await ensureColumn('checkins', 'policy_version', "TEXT NOT NULL DEFAULT 'mobile-v1'");
  await ensureColumn('responses', 'missing_reason', 'TEXT');
  for (const [column, definition] of [['hypothesis_spec_version', "TEXT NOT NULL DEFAULT '1'"], ['evaluator_version', "TEXT NOT NULL DEFAULT 'comparison-v1'"], ['evaluated_at', "TEXT NOT NULL DEFAULT ''"], ['window_start', "TEXT NOT NULL DEFAULT ''"], ['window_end', "TEXT NOT NULL DEFAULT ''"], ['result', "TEXT NOT NULL DEFAULT 'insufficient_data'"], ['cohort_metrics_json', "TEXT NOT NULL DEFAULT '[]'"], ['observed_effect', 'REAL'], ['required_effect', 'REAL NOT NULL DEFAULT 0'], ['data_quality_json', "TEXT NOT NULL DEFAULT '[]'"], ['sample_size', 'INTEGER NOT NULL DEFAULT 0'], ['missing_count', 'INTEGER NOT NULL DEFAULT 0'], ['excluded_count', 'INTEGER NOT NULL DEFAULT 0']] as const) await ensureColumn('hypothesis_evaluations', column, definition);
  return db;
}

export function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
