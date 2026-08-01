import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.METHEORY_DB ?? "data/metheory.sqlite3");
const result = { ok: true, databasePath, integrity: "unavailable", foreignKeyErrors: 0, migrationCount: 0, analysisRuns: 0, analysisStore: process.env.METHEORY_ANALYSIS_STORE === "postgres" ? "postgres" : "sqlite", postgresConfigured: Boolean(process.env.METHEORY_POSTGRES_URL), errors: [] as string[] };
if (!existsSync(databasePath)) {
  result.ok = false;
  result.errors.push("database_not_found");
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
const db = new DatabaseSync(databasePath, { readOnly: true });
try {
  result.integrity = String((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check);
  if (result.integrity !== "ok") { result.ok = false; result.errors.push("integrity_check_failed"); }
  result.foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all().length;
  if (result.foreignKeyErrors) { result.ok = false; result.errors.push("foreign_key_check_failed"); }
  result.migrationCount = Number((db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number }).count);
  result.analysisRuns = Number((db.prepare("SELECT COUNT(*) AS count FROM pcs_analysis_runs").get() as { count: number }).count);
  if (result.analysisStore === "postgres" && !result.postgresConfigured) { result.ok = false; result.errors.push("postgres_url_missing"); }
  console.log(JSON.stringify(result, null, 2));
} finally { db.close(); }
if (!result.ok) process.exitCode = 1;
