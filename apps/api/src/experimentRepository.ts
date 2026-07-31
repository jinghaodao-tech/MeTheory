import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  buildDataCollectionPlan,
  createExperimentDraftFromCandidate,
  evaluateExperiment,
  transitionExperiment,
  type CandidateForExperiment,
  type DataCollectionPlan,
  type Experiment,
  type ExperimentDraft,
  type ExperimentEvaluation,
  type ExperimentObservation,
  type ExperimentStatus,
  type CollectionRequirement
} from "../../../packages/domain/src/experiments.ts";

type Row = Record<string, unknown>;
const json = (value: unknown): string => JSON.stringify(value);
const parse = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
};

export class ExperimentObservationIdempotencyConflictError extends Error {
  constructor() { super("experiment_observation_idempotency_conflict"); }
}

export class SqliteExperimentRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private id(prefix: string): string { return `${prefix}_${randomUUID().replaceAll("-", "")}`; }

  createDraft(userId: string, candidate: CandidateForExperiment, options: { durationDays?: number; minimumObservations?: number; timezone?: string; now?: string } = {}): ExperimentDraft {
    if (!userId || !candidate.id || !candidate.conditionParameterId || !candidate.outcomeParameterId) throw new Error("experiment_candidate_invalid");
    const draft = createExperimentDraftFromCandidate({ id: this.id("experiment_draft"), candidate, ...options });
    const createdAt = options.now ?? new Date().toISOString();
    this.db.prepare("INSERT INTO experiment_drafts(id,user_id,source_candidate_id,draft_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(draft.id, userId, candidate.id, json(draft), draft.status, createdAt, createdAt);
    return draft;
  }

  private draftFromRow(row: Row): ExperimentDraft {
    const draft = parse<ExperimentDraft | null>(row.draft_json, null);
    if (!draft || typeof draft.id !== "string") throw new Error("experiment_draft_corrupt");
    return { ...draft, id: String(row.id), status: String(row.status) as ExperimentDraft["status"] };
  }

  listDrafts(userId: string, status?: string): ExperimentDraft[] {
    const rows = status
      ? this.db.prepare("SELECT * FROM experiment_drafts WHERE user_id=? AND status=? ORDER BY updated_at DESC").all(userId, status)
      : this.db.prepare("SELECT * FROM experiment_drafts WHERE user_id=? ORDER BY updated_at DESC").all(userId);
    return (rows as Row[]).map((row) => this.draftFromRow(row));
  }

  getDraft(userId: string, draftId: string): ExperimentDraft | undefined {
    const row = this.db.prepare("SELECT * FROM experiment_drafts WHERE user_id=? AND id=?").get(userId, draftId) as Row | undefined;
    return row ? this.draftFromRow(row) : undefined;
  }

  updateDraft(userId: string, draftId: string, patch: Partial<Pick<ExperimentDraft, "title" | "statement" | "durationDays" | "minimumObservations" | "minimumPerGroup" | "suggestedSchedule" | "stopConditions">>): ExperimentDraft {
    const current = this.getDraft(userId, draftId);
    if (!current || current.status !== "draft") throw new Error("experiment_draft_not_editable");
    const next: ExperimentDraft = { ...current, ...patch, status: "draft" };
    if (!next.title.trim() || !next.statement.trim() || next.durationDays < 1 || next.minimumPerGroup < 1 || next.minimumObservations < next.minimumPerGroup * 2) throw new Error("experiment_draft_invalid");
    const updatedAt = new Date().toISOString();
    const result = this.db.prepare("UPDATE experiment_drafts SET draft_json=?,updated_at=? WHERE user_id=? AND id=? AND status='draft'").run(json(next), updatedAt, userId, draftId);
    if (Number(result.changes) !== 1) throw new Error("experiment_draft_update_conflict");
    return next;
  }

  rejectDraft(userId: string, draftId: string): void {
    const draft = this.getDraft(userId, draftId);
    if (!draft || draft.status !== "draft") throw new Error("experiment_draft_not_available");
    this.db.prepare("UPDATE experiment_drafts SET status='rejected',updated_at=? WHERE user_id=? AND id=? AND status='draft'").run(new Date().toISOString(), userId, draftId);
  }

  acceptDraft(userId: string, draftId: string, hypothesisId?: string): Experiment {
    const draft = this.getDraft(userId, draftId);
    if (!draft || draft.status !== "draft") throw new Error("experiment_draft_not_available");
    if (hypothesisId && !this.db.prepare("SELECT 1 FROM hypotheses WHERE id=? AND user_id=?").get(hypothesisId, userId)) throw new Error("hypothesis_not_found");
    const now = new Date().toISOString();
    const experimentId = this.id("experiment");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db.prepare("UPDATE experiment_drafts SET status='accepted',updated_at=? WHERE user_id=? AND id=? AND status='draft'").run(now, userId, draftId);
      if (Number(result.changes) !== 1) throw new Error("experiment_draft_accept_conflict");
      this.db.prepare(`INSERT INTO experiments(id,user_id,draft_id,source_candidate_id,title,statement,kind,comparison_type,status,started_at,ended_at,duration_days,minimum_observations,minimum_per_group,schedule_json,stop_conditions_json,safety_notes_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        experimentId, userId, draftId, draft.sourceCandidateId, draft.title, draft.statement, draft.kind, draft.comparisonType, "ready", null, null,
        draft.durationDays, draft.minimumObservations, draft.minimumPerGroup, json(draft.suggestedSchedule), json(draft.stopConditions), json(draft.safetyNotes), now
      );
      for (const parameterId of draft.conditionParameters) this.db.prepare("INSERT INTO experiment_conditions(experiment_id,parameter_id,role,config_json) VALUES(?,?,?,?)").run(experimentId, parameterId, "condition", json({ groupA: draft.groupAKey, groupB: draft.groupBKey }));
      this.db.prepare("INSERT INTO experiment_conditions(experiment_id,parameter_id,role,config_json) VALUES(?,?,?,?)").run(experimentId, draft.targetOutcomeParameter, "outcome", json({}));
      for (const parameterId of draft.requiredParameters) this.db.prepare("INSERT INTO experiment_required_parameters(experiment_id,parameter_id,minimum_samples,askable,priority) VALUES(?,?,?,?,?)").run(experimentId, parameterId, draft.minimumPerGroup, 1, parameterId === draft.targetOutcomeParameter ? 0 : 100);
      this.db.prepare("INSERT INTO experiment_schedules(experiment_id,schedule_json,enabled,updated_at) VALUES(?,?,?,?)").run(experimentId, json(draft.suggestedSchedule), 1, now);
      for (const stop of draft.stopConditions) this.db.prepare("INSERT INTO experiment_stop_conditions(id,experiment_id,kind,description,threshold) VALUES(?,?,?,?,?)").run(this.id("stop"), experimentId, stop.kind, stop.description, stop.threshold ?? null);
      if (hypothesisId) this.db.prepare("INSERT INTO experiment_hypothesis_links(experiment_id,hypothesis_id,relation,created_at) VALUES(?,?,?,?)").run(experimentId, hypothesisId, "source", now);
      if (hypothesisId) this.db.prepare("INSERT INTO hypothesis_timelines(id,user_id,hypothesis_id,event_type,source_id,payload_json,created_at) VALUES(?,?,?,?,?,?,?)").run(this.id("timeline"), userId, hypothesisId, "experiment_created", experimentId, json({ draftId }), now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(userId, experimentId) as Experiment;
  }

  private experimentFromRow(row: Row): Experiment {
    return {
      id: String(row.id), userId: String(row.user_id), draftId: String(row.draft_id), sourceCandidateId: String(row.source_candidate_id),
      title: String(row.title), statement: String(row.statement), kind: String(row.kind) as Experiment["kind"], comparisonType: String(row.comparison_type) as Experiment["comparisonType"], groupAKey: parse<ExperimentDraft | undefined>(row.draft_json, undefined)?.groupAKey, groupBKey: parse<ExperimentDraft | undefined>(row.draft_json, undefined)?.groupBKey, expectedDirection: parse<ExperimentDraft | undefined>(row.draft_json, undefined)?.expectedDirection, status: String(row.status) as ExperimentStatus,
      startedAt: typeof row.started_at === "string" ? row.started_at : null, endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
      durationDays: Number(row.duration_days), minimumObservations: Number(row.minimum_observations), minimumPerGroup: Number(row.minimum_per_group),
      schedule: parse(row.schedule_json, { timezone: "UTC", frequency: "daily", preferredLocalTimes: [] }), stopConditions: parse(row.stop_conditions_json, []), safetyNotes: parse(row.safety_notes_json, []), createdAt: String(row.created_at)
    };
  }

  list(userId: string, status?: string): Experiment[] {
    const rows = status ? this.db.prepare("SELECT e.*,d.draft_json FROM experiments e JOIN experiment_drafts d ON d.id=e.draft_id WHERE e.user_id=? AND e.status=? ORDER BY e.created_at DESC").all(userId, status) : this.db.prepare("SELECT e.*,d.draft_json FROM experiments e JOIN experiment_drafts d ON d.id=e.draft_id WHERE e.user_id=? ORDER BY e.created_at DESC").all(userId);
    return (rows as Row[]).map((row) => this.experimentFromRow(row));
  }

  get(userId: string, experimentId: string): Experiment | undefined {
    const row = this.db.prepare("SELECT e.*,d.draft_json FROM experiments e JOIN experiment_drafts d ON d.id=e.draft_id WHERE e.user_id=? AND e.id=?").get(userId, experimentId) as Row | undefined;
    return row ? this.experimentFromRow(row) : undefined;
  }

  transition(userId: string, experimentId: string, next: ExperimentStatus): Experiment {
    const current = this.get(userId, experimentId);
    if (!current) throw new Error("experiment_not_found");
    const status = transitionExperiment(current.status, next);
    const timestamp = new Date().toISOString();
    const startedAt = status === "active" && !current.startedAt ? timestamp : current.startedAt;
    const endedAt = ["completed", "cancelled", "archived", "invalid"].includes(status) ? timestamp : current.endedAt;
    this.db.prepare("UPDATE experiments SET status=?,started_at=?,ended_at=? WHERE user_id=? AND id=?").run(status, startedAt, endedAt, userId, experimentId);
    this.db.prepare("INSERT INTO hypothesis_timelines(id,user_id,hypothesis_id,event_type,source_id,payload_json,created_at) SELECT ?,user_id,(SELECT hypothesis_id FROM experiment_hypothesis_links WHERE experiment_id=? LIMIT 1),?,?,?,? FROM experiments WHERE user_id=? AND id=? AND EXISTS(SELECT 1 FROM experiment_hypothesis_links WHERE experiment_id=? LIMIT 1)").run(this.id("timeline"), experimentId, `experiment_${status}`, experimentId, json({ status }), timestamp, userId, experimentId, experimentId);
    return this.get(userId, experimentId) as Experiment;
  }

  addObservationForExperiment(userId: string, experimentId: string, observation: Omit<ExperimentObservation, "experimentId">): ExperimentObservation {
    const experiment = this.get(userId, experimentId);
    if (!experiment) throw new Error("experiment_not_found");
    if (experiment.status === "paused") throw new Error("experiment_paused_observation_not_allowed");
    if (experiment.status !== "active") throw new Error("experiment_not_active");
    if (!observation.id || observation.id.length > 160 || !observation.observedAt || Number.isNaN(Date.parse(observation.observedAt))) throw new Error("experiment_observation_invalid");
    if (!observation.groupKey || observation.groupKey.length > 80 || ![experiment.groupAKey, experiment.groupBKey].includes(observation.groupKey)) throw new Error("experiment_observation_group_invalid");
    if (!Number.isFinite(observation.outcome)) throw new Error("experiment_observation_invalid");
    if (canonicalJson(observation.conditionValues ?? {}).length > 16_384 || (observation.note?.length ?? 0) > 2_000) throw new Error("experiment_observation_too_large");
    const idempotencyKey = observation.idempotencyKey ?? observation.id;
    if (!idempotencyKey || idempotencyKey.length > 160) throw new Error("experiment_observation_invalid");
    const incomingConditionValues = canonicalJson(observation.conditionValues ?? {});
    const existing = this.db.prepare("SELECT * FROM experiment_observations WHERE experiment_id=? AND idempotency_key=?").get(experimentId, idempotencyKey) as Row | undefined;
    if (existing) {
      const same = String(existing.observed_at) === observation.observedAt && String(existing.group_key) === observation.groupKey && Number(existing.outcome) === observation.outcome && canonicalJson(parse(existing.condition_values_json, {})) === incomingConditionValues && String(existing.source) === observation.source && Number(existing.eligible) === (observation.eligible ? 1 : 0) && (existing.note ?? null) === (observation.note ?? null);
      if (!same) throw new ExperimentObservationIdempotencyConflictError();
    }
    if (!existing) this.db.prepare("INSERT INTO experiment_observations(id,experiment_id,episode_id,idempotency_key,observed_at,group_key,outcome,condition_values_json,source,eligible,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(observation.id, experimentId, observation.episodeId ?? null, idempotencyKey, observation.observedAt, observation.groupKey, observation.outcome, incomingConditionValues, observation.source, observation.eligible ? 1 : 0, observation.note ?? null, new Date().toISOString());
    const stored = existing ?? this.db.prepare("SELECT * FROM experiment_observations WHERE experiment_id=? AND idempotency_key=?").get(experimentId, idempotencyKey) as Row | undefined;
    if (!stored) throw new Error("experiment_observation_save_failed");
    return { id: String(stored.id), experimentId, idempotencyKey, episodeId: typeof stored.episode_id === "string" ? stored.episode_id : undefined, observedAt: String(stored.observed_at), groupKey: String(stored.group_key), outcome: Number(stored.outcome), conditionValues: parse(stored.condition_values_json, {}), source: String(stored.source) as ExperimentObservation["source"], eligible: Number(stored.eligible) === 1, note: typeof stored.note === "string" ? stored.note : undefined };
  }

  observations(userId: string, experimentId: string): ExperimentObservation[] {
    if (!this.get(userId, experimentId)) throw new Error("experiment_not_found");
    const rows = this.db.prepare("SELECT * FROM experiment_observations WHERE experiment_id=? ORDER BY observed_at,id").all(experimentId) as Row[];
    return rows.map((row) => ({ id: String(row.id), experimentId: String(row.experiment_id), idempotencyKey: String(row.idempotency_key ?? row.id), episodeId: typeof row.episode_id === "string" ? row.episode_id : undefined, observedAt: String(row.observed_at), groupKey: String(row.group_key), outcome: Number(row.outcome), conditionValues: parse(row.condition_values_json, {}), source: String(row.source) as ExperimentObservation["source"], eligible: Number(row.eligible) === 1, note: typeof row.note === "string" ? row.note : undefined }));
  }

  evaluate(userId: string, experimentId: string, evaluatedAt?: string): ExperimentEvaluation {
    const experiment = this.get(userId, experimentId);
    if (!experiment) throw new Error("experiment_not_found");
    if (experiment.status !== "completed") throw new Error("experiment_must_be_completed");
    const draft = this.getDraft(userId, experiment.draftId);
    if (!draft) throw new Error("experiment_draft_not_found");
    const result = evaluateExperiment({ experimentId, observations: this.observations(userId, experimentId), groupAKey: draft.groupAKey, groupBKey: draft.groupBKey, minimumPerGroup: experiment.minimumPerGroup, minimumObservations: experiment.minimumObservations, expectedDirection: draft.expectedDirection, minimumEffect: draft.minimumEffect, kind: experiment.kind, evaluatedAt });
    const id = this.id("experiment_evaluation");
    const status: ExperimentStatus = result.status === "insufficient_data" ? "insufficient_data" : "evaluated";
    transitionExperiment(experiment.status, status);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO experiment_evaluations(id,experiment_id,evaluation_json,status,evaluated_at) VALUES(?,?,?,?,?)").run(id, experimentId, json(result), result.status, result.evaluatedAt);

      this.db.prepare("UPDATE experiments SET status=?,ended_at=COALESCE(ended_at,?) WHERE user_id=? AND id=?").run(status, result.evaluatedAt, userId, experimentId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return result;
  }

  latestEvaluation(userId: string, experimentId: string): ExperimentEvaluation | undefined {
    if (!this.get(userId, experimentId)) throw new Error("experiment_not_found");
    const row = this.db.prepare("SELECT evaluation_json FROM experiment_evaluations WHERE experiment_id=? ORDER BY evaluated_at DESC LIMIT 1").get(experimentId) as Row | undefined;
    return row ? parse<ExperimentEvaluation | undefined>(row.evaluation_json, undefined) : undefined;
  }

  createCollectionPlan(userId: string, input: { sourceAnalysisId: string; targetConstruct: string; requirements: CollectionRequirement[]; counts: Record<string, number>; includePcsTemplateRequest?: boolean }): DataCollectionPlan {
    const plan = buildDataCollectionPlan({ id: this.id("collection_plan"), ...input });
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO data_collection_plans(id,user_id,source_analysis_id,target_construct,plan_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(plan.id, userId, plan.sourceAnalysisId, plan.targetConstruct, json(plan), plan.status, now, now);
    for (const shortage of plan.shortages) this.db.prepare("INSERT INTO data_collection_shortages(plan_id,parameter_id,needed,reason) VALUES(?,?,?,?)").run(plan.id, shortage.key, shortage.needed, shortage.reason);
    return plan;
  }

  getCollectionPlan(userId: string, planId: string): DataCollectionPlan | undefined {
    const row = this.db.prepare("SELECT plan_json FROM data_collection_plans WHERE user_id=? AND id=?").get(userId, planId) as Row | undefined;
    return row ? parse<DataCollectionPlan | undefined>(row.plan_json, undefined) : undefined;
  }

  acceptCollectionPlan(userId: string, planId: string): DataCollectionPlan {
    const plan = this.getCollectionPlan(userId, planId);
    if (!plan) throw new Error("collection_plan_not_found");
    this.db.prepare("UPDATE data_collection_plans SET status='accepted',updated_at=? WHERE user_id=? AND id=? AND status='proposed'").run(new Date().toISOString(), userId, planId);
    return { ...plan, status: "accepted" };
  }

  saveReviewReason(userId: string, input: { candidateId: string; reason: string; action: string; note?: string }): void {
    this.db.prepare("INSERT INTO hypothesis_review_reasons(id,user_id,candidate_id,reason,note,action,created_at) VALUES(?,?,?,?,?,?,?)").run(this.id("hypothesis_reason"), userId, input.candidateId, input.reason, input.note ?? "", input.action, new Date().toISOString());
  }
}
