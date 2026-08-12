import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrateDatabase } from "../apps/api/src/db/migrate.ts";

test("migration repairs an old experiment observation table before schema indexes", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-legacy-db-"));
  const db = new DatabaseSync(join(directory, "legacy.sqlite3"));
  try {
    db.exec("CREATE TABLE experiment_observations (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, episode_id TEXT, observed_at TEXT NOT NULL, group_key TEXT NOT NULL, outcome REAL NOT NULL, condition_values_json TEXT NOT NULL DEFAULT '{}', source TEXT NOT NULL, eligible INTEGER NOT NULL DEFAULT 1, note TEXT, created_at TEXT NOT NULL) STRICT;");
    migrateDatabase(db, resolve("."));
    assert.ok((db.prepare("PRAGMA table_info(experiment_observations)").all() as Array<{ name: string }>).some((column) => column.name === "idempotency_key"));
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
