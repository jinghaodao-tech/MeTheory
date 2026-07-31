import type { DatabaseSync } from "node:sqlite";

export type ExperimentStatus = "planned" | "running" | "paused" | "completed" | "evaluated";
export type ExperimentObservation = { id?: string; group: "A" | "B"; value?: number; missing?: boolean };
type Metric = { count: number; validCount: number; missingCount: number; mean: number | null };

const now = () => new Date().toISOString();
const identifier = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function isObservation(value: unknown): value is ExperimentObservation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExperimentObservation>;
  return (item.group === "A" || item.group === "B") && (item.missing === true || typeof item.value === "number");
}

function metric(items: ExperimentObservation[]): Metric {
  const values = items.filter((item) => !item.missing && typeof item.value === "number").map((item) => item.value as number);
  return { count: items.length, validCount: values.length, missingCount: items.length - values.length, mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

export class PcsExperimentRepository {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  draft(userId: string, input: { runId: string; candidateId: string; title: string; plan?: unknown }) {
    if (!input.runId || !input.candidateId || !input.title.trim()) return null;
    const id = identifier("draft"); const timestamp = now();
    this.db.prepare("INSERT INTO pcs_experiment_drafts(id,user_id,run_id,candidate_id,title,plan_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, userId, input.runId, input.candidateId, input.title.trim(), JSON.stringify(input.plan ?? {}), timestamp, timestamp);
    return { id, status: "draft" as const, title: input.title.trim() };
  }

  acceptDraft(userId: string, id: string) { return Number(this.db.prepare("UPDATE pcs_experiment_drafts SET status='accepted',updated_at=? WHERE id=? AND user_id=? AND status='draft'").run(now(), id, userId).changes) > 0; }

  start(userId: string, draftId: string) {
    const draft = this.db.prepare("SELECT status FROM pcs_experiment_drafts WHERE id=? AND user_id=?").get(draftId, userId) as { status?: string } | undefined;
    if (draft?.status !== "accepted") return null;
    const id = identifier("experiment"); const timestamp = now();
    this.db.prepare("INSERT INTO pcs_experiments(id,user_id,draft_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(id, userId, draftId, "running", timestamp, timestamp);
    return { id, status: "running" as const };
  }

  transition(userId: string, id: string, status: string) {
    if (!["paused", "running", "completed"].includes(status)) return false;
    return Number(this.db.prepare("UPDATE pcs_experiments SET status=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('running','paused')").run(status, now(), id, userId).changes) > 0;
  }

  observe(userId: string, id: string, observation: unknown) {
    if (!isObservation(observation)) return false;
    const row = this.db.prepare("SELECT observations_json,status FROM pcs_experiments WHERE id=? AND user_id=?").get(id, userId) as { observations_json: string; status: ExperimentStatus } | undefined;
    if (!row || row.status !== "running") return false;
    const items = JSON.parse(row.observations_json) as ExperimentObservation[];
    if (observation.id && items.some((item) => item.id === observation.id)) return true;
    items.push(observation);
    this.db.prepare("UPDATE pcs_experiments SET observations_json=?,updated_at=? WHERE id=? AND user_id=?").run(JSON.stringify(items), now(), id, userId);
    return true;
  }

  evaluate(userId: string, id: string, supplied: unknown) { return Number(this.db.prepare("UPDATE pcs_experiments SET status='evaluated',evaluation_json=?,updated_at=? WHERE id=? AND user_id=? AND status='completed'").run(JSON.stringify(supplied), now(), id, userId).changes) > 0; }

  evaluateDeterministic(userId: string, id: string) {
    const row = this.db.prepare("SELECT observations_json,status FROM pcs_experiments WHERE id=? AND user_id=?").get(id, userId) as { observations_json: string; status: ExperimentStatus } | undefined;
    if (!row || row.status !== "completed") return null;
    const observations = JSON.parse(row.observations_json) as ExperimentObservation[];
    const groupA = metric(observations.filter((item) => item.group === "A")); const groupB = metric(observations.filter((item) => item.group === "B"));
    const minimumSample = Math.min(groupA.validCount, groupB.validCount);
    const ratio = minimumSample === 0 ? Infinity : Math.max(groupA.validCount, groupB.validCount) / minimumSample;
    const missingRate = (groupA.missingCount + groupB.missingCount) / Math.max(1, groupA.count + groupB.count);
    const warnings = [...(ratio > 3 ? ["sample_imbalance"] : []), ...(missingRate > 0.4 ? ["missing_rate_high"] : [])];
    const evaluation = { groupA, groupB, effectDifference: groupA.mean !== null && groupB.mean !== null ? groupA.mean - groupB.mean : null, sampleBalance: Math.min(groupA.validCount, groupB.validCount) / Math.max(1, Math.max(groupA.validCount, groupB.validCount)), missingRate, status: groupA.validCount && groupB.validCount && !warnings.length ? "ready" : "insufficient_data", warnings, evaluatedAt: now() };
    this.db.prepare("UPDATE pcs_experiments SET status='evaluated',evaluation_json=?,updated_at=? WHERE id=? AND user_id=? AND status='completed'").run(JSON.stringify(evaluation), now(), id, userId);
    return evaluation;
  }

  review(userId: string, runId: string, candidateId: string, rating: string, note: string) {
    if (!runId || !candidateId || !["fits", "does_not_fit", "on_hold"].includes(rating)) return false;
    return Number(this.db.prepare("INSERT INTO pcs_candidate_reviews(id,user_id,run_id,candidate_id,rating,note,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,run_id,candidate_id) DO UPDATE SET rating=excluded.rating,note=excluded.note,created_at=excluded.created_at").run(identifier("review"), userId, runId, candidateId, rating, note, now()).changes) > 0;
  }

  list(userId: string) { return this.db.prepare("SELECT * FROM pcs_experiments WHERE user_id=? ORDER BY updated_at DESC").all(userId); }
}
