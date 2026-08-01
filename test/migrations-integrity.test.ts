import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { migrateDatabase } from "../apps/api/src/db/migrate.ts";

test("legacy closed-loop tables are rebuilt with foreign keys and preserve rows", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("db/ts_mvp_schema.sql", "utf8"));
    db.exec(readFileSync("db/closed-loop-experiments-migration.sql", "utf8"));
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("legacy-user", "legacy-subject", "ja-JP", "Asia/Tokyo", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO experiment_drafts(id,user_id,source_candidate_id,draft_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("legacy-draft", "legacy-user", "candidate", "{}", "draft", "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
    migrateDatabase(db, process.cwd());
    assert.ok((db.prepare("PRAGMA foreign_key_list(experiment_drafts)").all() as unknown[]).length > 0);
    assert.equal((db.prepare("SELECT user_id FROM experiment_drafts WHERE id=?").get("legacy-draft") as { user_id: string }).user_id, "legacy-user");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    migrateDatabase(db, process.cwd());
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM experiment_drafts").get() as { count: number }).count, 1);
  } finally {
    db.close();
  }
});
