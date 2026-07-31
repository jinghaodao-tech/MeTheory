import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteExperimentRepository } from "../apps/api/src/experimentRepository.ts";

function database(): { db: DatabaseSync; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), "metheory-experiment-api-"));
  const db = new DatabaseSync(join(directory, "test.sqlite3"));
  const schema = readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8");
  db.exec(schema);
  db.exec(schema);
  assert.equal(Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='experiments'").get()), true);
  db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("user-a", "auth-a", "ja-JP", "Asia/Tokyo", "2026-07-30T00:00:00.000Z");
  db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("user-b", "auth-b", "ja-JP", "Asia/Tokyo", "2026-07-30T00:00:00.000Z");
  return { db, directory };
}

test("experiment repository preserves user isolation and evaluates a closed loop", () => {
  const { db, directory } = database();
  try {
    const repository = new SqliteExperimentRepository(db);
    const draft = repository.createDraft("user-a", { id: "candidate-a", conditionParameterId: "time_period", outcomeParameterId: "completion_status", conditionLabel: "時間帯", outcomeLabel: "完了", cohortAKey: "evening", cohortBKey: "morning", effectValue: 0.2, sampleCount: 8 }, { now: "2026-07-30T00:00:00.000Z" });
    assert.equal(repository.getDraft("user-b", draft.id), undefined);
    const experiment = repository.acceptDraft("user-a", draft.id);
    assert.equal(experiment.status, "ready");
    repository.transition("user-a", experiment.id, "active");
    for (let index = 0; index < 4; index += 1) {
      repository.addObservationForExperiment("user-a", experiment.id, { id: `obs-a-${index}`, idempotencyKey: `event-a-${index}`, observedAt: `2026-07-${10 + index}T09:00:00.000Z`, groupKey: "evening", outcome: 1, source: "checkin", eligible: true });
      repository.addObservationForExperiment("user-a", experiment.id, { id: `obs-b-${index}`, observedAt: `2026-07-${10 + index}T10:00:00.000Z`, groupKey: "morning", outcome: 0, source: "checkin", eligible: true });
    }
    const duplicate = repository.addObservationForExperiment("user-a", experiment.id, { id: "different-id", idempotencyKey: "event-a-0", observedAt: "2026-07-10T09:00:00.000Z", groupKey: "evening", outcome: 99, source: "checkin", eligible: true });
    assert.equal(duplicate.id, "obs-a-0");
    assert.equal(repository.observations("user-a", experiment.id).length, 8);
    repository.transition("user-a", experiment.id, "completed");
    const evaluation = repository.evaluate("user-a", experiment.id);
    assert.equal(evaluation.status, "supported");
    assert.equal(repository.get("user-b", experiment.id), undefined);
    assert.throws(() => repository.evaluate("user-b", experiment.id), /experiment_not_found/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("collection plan keeps PCS request pending for explicit approval", () => {
  const { db, directory } = database();
  try {
    const repository = new SqliteExperimentRepository(db);
    const plan = repository.createCollectionPlan("user-a", { sourceAnalysisId: "analysis-a", targetConstruct: "task_initiation", requirements: [{ parameterId: "energy_level", label: "エネルギー", minimumSamples: 3, askable: true, preferredSource: "user" }], counts: { energy_level: 1 }, includePcsTemplateRequest: true });
    assert.equal(plan.status, "proposed");
    assert.equal(plan.pcsTemplateRequest?.status, "draft");
    assert.equal(repository.getCollectionPlan("user-b", plan.id), undefined);
    assert.equal(repository.acceptCollectionPlan("user-a", plan.id).status, "accepted");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration keeps legacy rows and accept rollback leaves the draft unchanged", () => {
  const { db, directory } = database();
  try {
    db.prepare("INSERT INTO self_beliefs(id,user_id,statement,source_kind,created_at) VALUES(?,?,?,?,?)").run("belief-legacy", "user-a", "legacy belief", "user", "2026-07-30T00:00:00.000Z");
    db.exec(readFileSync(join(process.cwd(), "db", "closed-loop-experiments-migration.sql"), "utf8"));
    assert.equal(db.prepare("SELECT statement FROM self_beliefs WHERE id=?").get("belief-legacy")?.statement, "legacy belief");
    const repository = new SqliteExperimentRepository(db);
    const draft = repository.createDraft("user-a", { id: "candidate-rollback", conditionParameterId: "time_period", outcomeParameterId: "completion_status", conditionLabel: "period", outcomeLabel: "outcome", cohortAKey: "a", cohortBKey: "b", effectValue: 1, sampleCount: 8 });
    db.exec("CREATE TRIGGER forced_experiment_failure BEFORE INSERT ON experiments BEGIN SELECT RAISE(ABORT, 'forced_experiment_failure'); END");
    assert.throws(() => repository.acceptDraft("user-a", draft.id), /forced_experiment_failure/);
    assert.equal(repository.getDraft("user-a", draft.id)?.status, "draft");
    assert.equal(repository.list("user-a").length, 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
