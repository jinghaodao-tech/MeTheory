import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import { migrateDatabase } from "../apps/api/src/db/migrate.ts";

test("legacy closed-loop tables are rebuilt with foreign keys and preserve rows", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("test/fixtures/legacy-closed-loop-no-fk.sql", "utf8"));
    db.prepare("INSERT INTO self_beliefs(id,user_id,statement,source_kind,status,user_note,source_analysis_periods_json,supporting_field_pairs_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run("legacy-belief", "legacy-user", "Legacy belief", "user", "active", "", "[]", "[]", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO self_belief_revisions(id,belief_id,user_id,previous_statement,proposed_statement,final_statement,resolution_action,user_note,approved_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run("legacy-revision", "legacy-belief", "legacy-user", "Old", "New", "New", "new", "", "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO experiments(id,user_id,draft_id,source_candidate_id,title,statement,kind,comparison_type,status,started_at,ended_at,duration_days,minimum_observations,minimum_per_group,schedule_json,stop_conditions_json,safety_notes_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("legacy-experiment", "legacy-user", "legacy-draft", "candidate", "Legacy experiment", "Legacy statement", "condition_comparison", "condition_difference", "draft", null, null, 7, 2, 1, "{}", "{}", "{}", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO experiment_observations(id,experiment_id,episode_id,observed_at,group_key,outcome,source,created_at) VALUES(?,?,?,?,?,?,?,?)").run("legacy-observation", "legacy-experiment", null, "2026-08-01T00:00:00.000Z", "a", 1, "manual", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO experiment_evaluations(id,experiment_id,evaluation_json,status,evaluated_at) VALUES(?,?,?,?,?)").run("legacy-evaluation", "legacy-experiment", "{}", "inconclusive", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("legacy-user", "legacy-subject", "ja-JP", "Asia/Tokyo", "2026-08-01T00:00:00.000Z");
    db.prepare("INSERT INTO experiment_drafts(id,user_id,source_candidate_id,draft_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("legacy-draft", "legacy-user", "candidate", "{}", "draft", "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
    assert.equal((db.prepare("PRAGMA foreign_key_list(experiment_drafts)").all() as unknown[]).length, 0);
    assert.equal((db.prepare("PRAGMA foreign_key_list(experiments)").all() as unknown[]).length, 0);
    migrateDatabase(db, process.cwd());
    assert.ok((db.prepare("PRAGMA foreign_key_list(experiment_drafts)").all() as unknown[]).length > 0);
    assert.ok((db.prepare("PRAGMA foreign_key_list(experiments)").all() as unknown[]).length > 0);
    assert.ok((db.prepare("PRAGMA foreign_key_list(self_beliefs)").all() as unknown[]).length > 0);
    assert.ok((db.prepare("PRAGMA foreign_key_list(self_belief_revisions)").all() as unknown[]).length > 0);
    assert.equal((db.prepare("SELECT user_id FROM experiment_drafts WHERE id=?").get("legacy-draft") as { user_id: string }).user_id, "legacy-user");
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM experiments").get() as { count: number }).count, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM experiment_observations").get() as { count: number }).count, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM experiment_evaluations").get() as { count: number }).count, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM self_beliefs").get() as { count: number }).count, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM self_belief_revisions").get() as { count: number }).count, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    migrateDatabase(db, process.cwd());
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM experiment_drafts").get() as { count: number }).count, 1);
  } finally {
    db.close();
  }
});
