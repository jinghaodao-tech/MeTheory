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
    const activeExperiment = repository.transition("user-a", experiment.id, "active");
    for (let index = 0; index < 21; index += 1) {
      const observedAt = new Date(Date.parse(activeExperiment.startedAt!) + (index + 1) * 3600000).toISOString();
      repository.addObservationForExperiment("user-a", experiment.id, { id: `obs-a-${index}`, idempotencyKey: `event-a-${index}`, observedAt, groupKey: "evening", outcome: 1, source: "checkin", eligible: true });
      repository.addObservationForExperiment("user-a", experiment.id, { id: `obs-b-${index}`, observedAt: new Date(Date.parse(observedAt) + 60000).toISOString(), groupKey: "morning", outcome: 0, source: "checkin", eligible: true });
    }
    const duplicate = repository.addObservationForExperiment("user-a", experiment.id, { id: "different-id", idempotencyKey: "event-a-0", observedAt: new Date(Date.parse(activeExperiment.startedAt!) + 3600000).toISOString(), groupKey: "evening", outcome: 1, source: "checkin", eligible: true });
    assert.equal(duplicate.id, "obs-a-0");
    assert.throws(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "different-id", idempotencyKey: "event-a-0", observedAt: new Date(Date.parse(activeExperiment.startedAt!) + 3600000).toISOString(), groupKey: "evening", outcome: 99, source: "checkin", eligible: true }), /experiment_observation_idempotency_conflict/);
    assert.throws(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "bad-group", groupKey: "unknown", observedAt: new Date(Date.parse(activeExperiment.startedAt!) + 3600000).toISOString(), outcome: 1, source: "checkin", eligible: true }), /experiment_observation_group_invalid/);
    assert.equal(repository.observations("user-a", experiment.id).length, 42);
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

test("paused experiments reject observations and a draft cannot be accepted twice", () => {
  const { db, directory } = database();
  try {
    const repository = new SqliteExperimentRepository(db);
    const draft = repository.createDraft("user-a", { id: "candidate-paused", conditionParameterId: "time_period", outcomeParameterId: "completion_status", conditionLabel: "period", outcomeLabel: "outcome", cohortAKey: "a", cohortBKey: "b", effectValue: 1, sampleCount: 8 });
    const experiment = repository.acceptDraft("user-a", draft.id);
    assert.throws(() => repository.acceptDraft("user-a", draft.id), /experiment_draft_not_available/);
    repository.transition("user-a", experiment.id, "active");
    repository.transition("user-a", experiment.id, "paused");
    assert.throws(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "paused", groupKey: "a", observedAt: "2026-07-30T00:00:00.000Z", outcome: 1, source: "manual", eligible: true }), /experiment_paused_observation_not_allowed/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("observation range and experiment period are enforced independently of group validation", () => {
  const { db, directory } = database();
  try {
    db.prepare("INSERT INTO parameter_definitions(id,name_ja,description_ja,value_type,parameter_layer,temporal_type,sensitivity,definition_version,minimum_value,maximum_value) VALUES(?,?,?,?,?,?,?,?,?,?)").run("bounded_outcome", "Bounded", "Bounded", "integer", "base", "activity", "normal", "1", 1, 5);
    const repository = new SqliteExperimentRepository(db);
    const draft = repository.createDraft("user-a", { id: "candidate-range", conditionParameterId: "time_period", outcomeParameterId: "bounded_outcome", conditionLabel: "period", outcomeLabel: "bounded", cohortAKey: "a", cohortBKey: "b", effectValue: 1, sampleCount: 8 });
    const experiment = repository.acceptDraft("user-a", draft.id); repository.transition("user-a", experiment.id, "active"); const started = repository.get("user-a", experiment.id)!.startedAt!;
    assert.throws(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "low", groupKey: "a", observedAt: started, outcome: 0, source: "manual", eligible: true }), /experiment_observation_range_invalid/);
    assert.throws(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "high", groupKey: "a", observedAt: started, outcome: 6, source: "manual", eligible: true }), /experiment_observation_range_invalid/);
    assert.doesNotThrow(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "min", groupKey: "a", observedAt: started, outcome: 1, source: "manual", eligible: true }));
    assert.doesNotThrow(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "max", groupKey: "b", observedAt: started, outcome: 5, source: "manual", eligible: true }));
    const periodEnd = new Date(Date.parse(started) + repository.get("user-a", experiment.id)!.durationDays * 86400000).toISOString();
    assert.doesNotThrow(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "at-end", groupKey: "a", observedAt: periodEnd, outcome: 3, source: "manual", eligible: true }));
    assert.throws(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "after-end", groupKey: "b", observedAt: new Date(Date.parse(periodEnd) + 1).toISOString(), outcome: 3, source: "manual", eligible: true }), /experiment_observation_after_period/);
    assert.throws(() => repository.addObservationForExperiment("user-a", experiment.id, { id: "before", groupKey: "a", observedAt: new Date(Date.parse(started) - 1).toISOString(), outcome: 3, source: "manual", eligible: true }), /experiment_observation_before_start/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
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