import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.METHEORY_POSTGRES_URL;
if (!connectionString) throw new Error("METHEORY_POSTGRES_URL is required");
const sqlite = new DatabaseSync(process.env.METHEORY_DB ?? resolve(import.meta.dirname, "../data/metheory.sqlite3"), { readOnly: true });
const pool = new Pool({ connectionString, max: 2 });
try {
  const rows = sqlite.prepare("SELECT id,user_id,snapshot_id,profile_id,generated_at,period_start_at,period_end_at,timezone,schema_version,source_record_ids_json,source_fingerprint,contract_hash,result_summary_json,created_at FROM pcs_analysis_runs ORDER BY created_at").all() as Array<Record<string, string>>;
  await pool.query("BEGIN");
  for (const row of rows) await pool.query("INSERT INTO pcs_analysis_runs(id,user_id,snapshot_id,profile_id,generated_at,period_start_at,period_end_at,timezone,schema_version,source_record_ids,source_fingerprint,contract_hash,result_summary,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14) ON CONFLICT(user_id,snapshot_id) DO UPDATE SET result_summary=EXCLUDED.result_summary", [row.id, row.user_id, row.snapshot_id, row.profile_id, row.generated_at, row.period_start_at, row.period_end_at, row.timezone, row.schema_version, row.source_record_ids_json, row.source_fingerprint, row.contract_hash, row.result_summary_json, row.created_at]);
  await pool.query("COMMIT");
  console.log(JSON.stringify({ ok: true, driver: "postgres", imported: rows.length }));
} catch (error) { await pool.query("ROLLBACK"); throw error; }
finally { sqlite.close(); await pool.end(); }
