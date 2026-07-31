import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PCS_MIGRATION_VERSION = "pcs-analysis-v2.1";
export function migratePcsSchema(db: DatabaseSync, root: string): void {
  db.exec(readFileSync(resolve(root, "db", "ts_mvp_schema.sql"), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)").run(PCS_MIGRATION_VERSION, new Date().toISOString());
}
/** Deliberately only removes the migration marker. Data rollback is not automatic or destructive. */
export function rollbackPcsMigrationMarker(db: DatabaseSync): void {
  db.prepare("DELETE FROM schema_migrations WHERE version=?").run(PCS_MIGRATION_VERSION);
}
