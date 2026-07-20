import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateEvidence, directionForObservation, RULE_VERSION, type ObservationInput } from "../../../packages/domain/src/index.ts";
import { buildEpisodes } from "../../../packages/domain/src/hypothesis/episodes.ts";
import { evaluateHypothesis } from "../../../packages/domain/src/hypothesis/evaluators.ts";
import { validateHypothesisSpec } from "../../../packages/domain/src/hypothesis/spec.ts";

const root = resolve(import.meta.dirname, "../../..");
const databasePath = process.env.METHEORY_DB ?? resolve(root, "data", "metheory.sqlite3");
const db = new DatabaseSync(databasePath);
db.exec(readFileSync(resolve(root, "db", "ts_mvp_schema.sql"), "utf8"));

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("hypotheses", "state", "TEXT NOT NULL DEFAULT 'tracking'");
ensureColumn("hypotheses", "spec_json", "TEXT");
ensureColumn("hypotheses", "spec_version", "TEXT");
ensureColumn("responses", "capture_mode", "TEXT NOT NULL DEFAULT 'momentary_observation'");
ensureColumn("hypothesis_evaluations", "hypothesis_spec_version", "TEXT NOT NULL DEFAULT '1'");
ensureColumn("hypothesis_evaluations", "evaluator_version", "TEXT NOT NULL DEFAULT 'comparison-v1'");
ensureColumn("hypothesis_evaluations", "evaluated_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("hypothesis_evaluations", "window_start", "TEXT NOT NULL DEFAULT ''");
ensureColumn("hypothesis_evaluations", "window_end", "TEXT NOT NULL DEFAULT ''");
ensureColumn("hypothesis_evaluations", "result", "TEXT NOT NULL DEFAULT 'inconclusive'");
ensureColumn("hypothesis_evaluations", "cohort_metrics_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("hypothesis_evaluations", "observed_effect", "REAL");
ensureColumn("hypothesis_evaluations", "required_effect", "REAL NOT NULL DEFAULT 0");
ensureColumn("hypothesis_evaluations", "data_quality_json", "TEXT NOT NULL DEFAULT '[]'");

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function pathParts(request: IncomingMessage): string[] {
  return new URL(request.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean);
}

function userExists(userId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId));
}

function createCheckin(userId: string, kind: string, hypothesisId: string | null): Record<string, unknown> {
  const checkinId = id("checkin");
  const hypothesis = hypothesisId
    ? db.prepare("SELECT spec_json FROM hypotheses WHERE id = ?").get(hypothesisId) as Record<string, unknown> | undefined
    : undefined;
  const spec = hypothesis?.spec_json ? validateHypothesisSpec(JSON.parse(hypothesis.spec_json as string)) : null;
  const requiredFields = spec
    ? [...new Set([...spec.scope.map((condition) => condition.field), ...spec.cohorts.flatMap((cohort) => cohort.conditions.map((condition) => condition.field)), spec.outcome.field])]
    : undefined;
  const question = kind === "random"
    ? { text: "What are you doing right now?", type: "single_choice", field: "activity_type", options: ["work", "rest", "move", "eat", "other"] }
    : { text: "What was the outcome of this activity?", type: "single_choice", field: "outcome", options: ["completed", "interrupted", "not_applicable"], ...(requiredFields ? { requiredFields } : {}) };
  db.prepare("INSERT INTO checkins(id, user_id, hypothesis_id, kind, question_json, scheduled_at, expires_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(checkinId, userId, hypothesisId, kind, JSON.stringify(question), now(), new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), RULE_VERSION);
  return { id: checkinId, userId, hypothesisId, kind, question, responseStatus: "pending", policyVersion: RULE_VERSION };
}

function saveResponse(checkinId: string, input: Record<string, unknown>): Record<string, unknown> {
  const existing = db.prepare("SELECT * FROM responses WHERE idempotency_key = ?").get(input.idempotencyKey as string) as Record<string, unknown> | undefined;
  if (existing) return existing;
  const checkin = db.prepare("SELECT * FROM checkins WHERE id = ?").get(checkinId) as Record<string, unknown> | undefined;
  if (!checkin) throw new Error("checkin_not_found");
  const responseId = id("response");
  const question = JSON.parse(checkin.question_json as string) as { field?: string };
  const aliases: Record<string, string> = {
    activityType: "activity_type",
    activityContext: "activity_context",
  };
  const observationFields = ["activity_context", "energy", "activity_type", "outcome", "satisfaction", "mood", "stress"];
  const observations = observationFields
    .map((field) => ({ field, value: input[field] ?? input[Object.keys(aliases).find((alias) => aliases[alias] === field) ?? ""] }))
    .filter((observation) => observation.value !== undefined);
  if (observations.length === 0 && question.field) observations.push({ field: question.field, value: null });
  const observationIds = observations.map(() => id("obs"));
  const payload = JSON.stringify(input);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO responses(id, checkin_id, idempotency_key, client_created_at, server_received_at, payload_json, missing_reason, capture_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(responseId, checkinId, input.idempotencyKey as string, (input.clientCreatedAt as string | undefined) ?? now(), now(), payload, input.missingReason ?? null, "momentary_observation");
    for (const [index, observationInput] of observations.entries()) {
      const observation: ObservationInput = {
        field: observationInput.field,
        value: observationInput.value,
        certainty: input.missingReason ? "low" : "high",
        source: "user_confirmed",
        missing: Boolean(input.missingReason) || observationInput.value === null,
      };
      db.prepare("INSERT INTO observations(id, response_id, field, value_json, certainty, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(observationIds[index], responseId, observation.field, JSON.stringify(observation.value), observation.certainty, observation.source, now());
    }
    db.prepare("UPDATE checkins SET response_status = 'answered' WHERE id = ?").run(checkinId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: responseId, checkinId, idempotencyKey: input.idempotencyKey, observationId: observationIds[0] ?? null, observationIds };
}

function evaluateStoredHypothesis(hypothesisId: string, evaluatedAt = now()): Record<string, unknown> {
  const hypothesis = db.prepare("SELECT id, spec_json FROM hypotheses WHERE id = ?").get(hypothesisId) as Record<string, unknown> | undefined;
  if (!hypothesis) throw new Error("hypothesis_not_found");
  if (!hypothesis.spec_json) throw new Error("hypothesis_spec_required");
  const spec = validateHypothesisSpec(JSON.parse(hypothesis.spec_json as string));
  const rows = db.prepare("SELECT r.id AS response_id, c.id AS checkin_id, COALESCE(r.server_received_at, c.scheduled_at) AS captured_at, r.capture_mode, o.field, o.value_json, o.certainty, o.source FROM responses r JOIN checkins c ON c.id = r.checkin_id JOIN observations o ON o.response_id = r.id WHERE c.hypothesis_id = ? ORDER BY r.server_received_at, o.created_at")
    .all(hypothesisId) as Array<Record<string, unknown>>;
  const episodes = buildEpisodes(rows.map((row) => ({ responseId: row.response_id as string, checkinId: row.checkin_id as string, capturedAt: row.captured_at as string, captureMode: row.capture_mode as "momentary_observation" | "retrospective_entry", field: row.field as string, value: JSON.parse(row.value_json as string), source: row.source as "user_confirmed" | "ai_inferred" | "system", certainty: row.certainty as "high" | "medium" | "low" })));
  const evaluation = evaluateHypothesis(hypothesisId, spec, episodes, evaluatedAt);
  const legacyStatus = evaluation.result === "supports" ? "supported" : evaluation.result === "challenges" ? "challenged" : "inconclusive";
  const evaluationId = id("eval");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO hypothesis_evaluations(id, hypothesis_id, hypothesis_spec_version, evaluator_version, evaluated_at, window_start, window_end, result, cohort_metrics_json, observed_effect, required_effect, data_quality_json, rule_version, status, support_count, challenge_count, insufficient_count, sample_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(evaluationId, hypothesisId, evaluation.hypothesisSpecVersion, evaluation.evaluatorVersion, evaluation.evaluatedAt, evaluation.windowStart, evaluation.windowEnd, evaluation.result, JSON.stringify(evaluation.cohortMetrics), evaluation.observedEffect, evaluation.requiredEffect, JSON.stringify(evaluation.dataQualityFlags), evaluation.evaluatorVersion, legacyStatus, evaluation.cohortMetrics[0].eligibleSamples && evaluation.cohortMetrics[0].metricValue !== null ? Math.round(evaluation.cohortMetrics[0].eligibleSamples * evaluation.cohortMetrics[0].metricValue) : 0, evaluation.cohortMetrics[1].eligibleSamples && evaluation.cohortMetrics[1].metricValue !== null ? Math.round(evaluation.cohortMetrics[1].eligibleSamples * evaluation.cohortMetrics[1].metricValue) : 0, evaluation.cohortMetrics.reduce((sum, metric) => sum + metric.missingSamples, 0), evaluation.samples.length, now());
    for (const sample of evaluation.samples) {
      db.prepare("INSERT INTO hypothesis_evaluation_samples(evaluation_id, response_id, cohort_key, included, outcome_json, exclusion_reason) VALUES (?, ?, ?, ?, ?, ?)").run(evaluationId, sample.responseId, sample.cohortKey, sample.included ? 1 : 0, JSON.stringify(sample.outcomeValue), sample.exclusionReason);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: evaluationId, ...evaluation };
}

function latestInsight(hypothesisId: string): Record<string, unknown> | null {
  return db.prepare("SELECT h.id, h.statement, h.state, e.result, e.cohort_metrics_json, e.observed_effect, e.data_quality_json, e.evaluated_at FROM hypotheses h LEFT JOIN hypothesis_evaluations e ON e.id = (SELECT id FROM hypothesis_evaluations WHERE hypothesis_id = h.id ORDER BY created_at DESC LIMIT 1) WHERE h.id = ?").get(hypothesisId) as Record<string, unknown> | null;
}

const server = createServer(async (request, response) => {
  const parts = pathParts(request);
  try {
    if (request.method === "GET" && parts.join("/") === "healthz") return json(response, 200, { status: "ok", service: "metheory-api" });
    if (request.method === "POST" && parts.join("/") === "v1/users") {
      const input = await body(request); const userId = id("usr");
      db.prepare("INSERT INTO users(id, auth_subject, locale, timezone, created_at) VALUES (?, ?, ?, ?, ?)").run(userId, input.authSubject ?? "local-user", input.locale ?? "ja-JP", input.timezone ?? "Asia/Tokyo", now());
      return json(response, 201, { id: userId });
    }
    if (request.method === "POST" && parts.length === 2 && parts[0] === "v1" && parts[1] === "self-beliefs") {
      const input = await body(request); if (!userExists(input.userId as string)) return json(response, 404, { error: "user_not_found" });
      const beliefId = id("belief"); db.prepare("INSERT INTO self_beliefs(id, user_id, statement, source_kind, created_at) VALUES (?, ?, ?, 'user', ?)").run(beliefId, input.userId, input.statement, now());
      return json(response, 201, { id: beliefId, userId: input.userId, statement: input.statement });
    }
    if (request.method === "POST" && parts.length === 2 && parts[0] === "v1" && parts[1] === "hypotheses") {
      const input = await body(request); if (!userExists(input.userId as string)) return json(response, 404, { error: "user_not_found" });
      const spec = input.spec ? validateHypothesisSpec(input.spec) : null;
      const hypothesisId = id("hyp"); db.prepare("INSERT INTO hypotheses(id, user_id, self_belief_id, template_key, statement, state, status, spec_json, spec_version, rule_version, created_at) VALUES (?, ?, ?, ?, ?, 'tracking', 'tracking', ?, ?, ?, ?)").run(hypothesisId, input.userId, input.selfBeliefId ?? null, input.templateKey ?? "belief_vs_observation", input.statement, spec ? JSON.stringify(spec) : null, spec?.schemaVersion ?? null, RULE_VERSION, now());
      return json(response, 201, { id: hypothesisId, state: "tracking", specVersion: spec?.schemaVersion ?? null });
    }
    if (request.method === "POST" && parts.join("/") === "v1/checkins/next") {
      const input = await body(request); const userId = input.userId as string; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const hypothesis = db.prepare("SELECT id FROM hypotheses WHERE user_id = ? AND status = 'tracking' ORDER BY created_at LIMIT 1").get(userId) as { id: string } | undefined;
      const kind = input.kind === "follow_up" ? "follow_up" : input.kind === "hypothesis" && hypothesis ? "hypothesis" : "random";
      return json(response, 201, createCheckin(userId, kind, kind === "hypothesis" ? hypothesis!.id : null));
    }
    if (request.method === "POST" && parts.length === 4 && parts[0] === "v1" && parts[1] === "checkins" && parts[3] === "responses") {
      return json(response, 201, saveResponse(parts[2], await body(request)));
    }
    if (request.method === "POST" && parts.length === 4 && parts[0] === "v1" && parts[1] === "hypotheses" && parts[3] === "evaluate") {
      const input = await body(request);
      return json(response, 201, evaluateStoredHypothesis(parts[2], (input.evaluatedAt as string | undefined) ?? now()));
    }
    if (request.method === "GET" && parts.length === 4 && parts[0] === "v1" && parts[1] === "hypotheses" && parts[3] === "evaluations") {
      const rows = db.prepare("SELECT * FROM hypothesis_evaluations WHERE hypothesis_id = ? ORDER BY created_at DESC").all(parts[2]) as Array<Record<string, unknown>>;
      return json(response, 200, { items: rows });
    }
    if (request.method === "GET" && parts.length === 3 && parts[0] === "v1" && parts[1] === "hypotheses") {
      return json(response, 200, latestInsight(parts[2]));
    }
    return json(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    return json(response, message.endsWith("_not_found") ? 404 : 400, { error: message });
  }
});

const port = Number(process.env.PORT ?? 8100);
server.listen(port, "127.0.0.1", () => console.log(`MeTheory TypeScript API listening on http://127.0.0.1:${port}`));
