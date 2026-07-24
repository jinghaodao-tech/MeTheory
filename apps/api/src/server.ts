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
db.exec("CREATE TABLE IF NOT EXISTS ai_http_access_audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_id TEXT NOT NULL, client_type TEXT NOT NULL, purpose TEXT NOT NULL, requested_parameter_ids_json TEXT NOT NULL, allowed_parameter_ids_json TEXT NOT NULL, denied_parameter_ids_json TEXT NOT NULL, requested_start_at TEXT, requested_end_at TEXT, returned_record_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL)");

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

function aiClientAllowed(clientId: string, clientType: string): boolean {
  const configured = (process.env.METHEORY_AI_CLIENTS ?? "local-dev").split(",").map((value) => value.trim()).filter(Boolean);
  return configured.includes(clientId) && ["custom_gpt", "mcp", "openai_api", "other"].includes(clientType);
}

function aiUserId(request: IncomingMessage, url: URL): string {
  return String(url.searchParams.get("userId") ?? request.headers["x-metheory-user-id"] ?? "");
}

function aiParameterIds(rows: Array<Record<string, unknown>>): string[] { return [...new Set(rows.map((row) => String(row.field)).filter((field) => /^[a-z][a-z0-9_]{1,63}$/.test(field)))]; }

function writeAiAudit(input: { userId: string; clientId: string; clientType: string; purpose: string; parameterIds: string[]; allowed: string[]; denied: string[]; startAt?: string; endAt?: string; count: number; status: string }) {
  db.prepare("INSERT INTO ai_http_access_audit_logs(id,user_id,client_id,client_type,purpose,requested_parameter_ids_json,allowed_parameter_ids_json,denied_parameter_ids_json,requested_start_at,requested_end_at,returned_record_count,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id("ai_audit"), input.userId, input.clientId, input.clientType, input.purpose, JSON.stringify(input.parameterIds), JSON.stringify(input.allowed), JSON.stringify(input.denied), input.startAt ?? null, input.endAt ?? null, input.count, input.status, now());
}

function aiAggregate(input: Record<string, unknown>): Record<string, unknown> {
  const userId = String(input.userId ?? ""); const clientId = String(input.clientId ?? ""); const clientType = String(input.clientType ?? "other"); const purpose = String(input.purpose ?? ""); const parameterIds = Array.isArray(input.parameterIds) ? input.parameterIds.map(String).slice(0, 10) : []; const startAt = String(input.startAt ?? ""); const endAt = String(input.endAt ?? "");
  if (!userExists(userId)) throw new Error("user_not_found"); if (!aiClientAllowed(clientId, clientType)) throw new Error("ai_client_not_allowed"); if (!purpose || !parameterIds.length) throw new Error("ai_scope_required"); const start = new Date(startAt); const end = new Date(endAt); if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw new Error("invalid_period"); if (end.getTime() - start.getTime() > 90 * 86400000) throw new Error("period_too_long");
  const placeholders = parameterIds.map(() => "?").join(","); const rows = db.prepare(`SELECT o.field,o.value_json,o.certainty,o.created_at FROM observations o JOIN responses r ON r.id=o.response_id JOIN checkins c ON c.id=r.checkin_id WHERE c.user_id=? AND o.field IN (${placeholders}) AND o.created_at>=? AND o.created_at<? AND o.source='user_confirmed'`).all(userId, ...parameterIds, startAt, endAt) as Array<Record<string, unknown>>;
  const groups = parameterIds.map((parameterId) => { const values = rows.filter((row) => row.field === parameterId).map((row) => { try { return JSON.parse(String(row.value_json)); } catch { return null; } }); const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)); return { parameterId, sampleCount: values.filter((value) => value !== null).length, missingCount: values.filter((value) => value === null).length, mean: numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null, minimum: numeric.length ? Math.min(...numeric) : null, maximum: numeric.length ? Math.max(...numeric) : null }; });
  writeAiAudit({ userId, clientId, clientType, purpose, parameterIds, allowed: parameterIds, denied: [], startAt, endAt, count: rows.length, status: "allowed" }); return { accessLevel: "aggregate_only", groups, deniedParameterIds: [] };
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
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  try {
    if (request.method === "GET" && parts.join("/") === "healthz") return json(response, 200, { status: "ok", service: "metheory-api" });
    if (parts[0] === "v1" && parts[1] === "ai" && request.method === "GET") {
      const userId = aiUserId(request, requestUrl); const clientId = requestUrl.searchParams.get("clientId") ?? String(request.headers["x-metheory-client-id"] ?? ""); const clientType = requestUrl.searchParams.get("clientType") ?? String(request.headers["x-metheory-client-type"] ?? "other"); const purpose = requestUrl.searchParams.get("purpose") ?? "read_only_ai";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); if (!aiClientAllowed(clientId, clientType)) return json(response, 403, { error: "ai_client_not_allowed" });
      if (parts.length === 3 && parts[2] === "parameters") { const rows = db.prepare("SELECT field, COUNT(*) AS sample_count, MAX(created_at) AS last_observed_at FROM observations o JOIN responses r ON r.id=o.response_id JOIN checkins c ON c.id=r.checkin_id WHERE c.user_id=? GROUP BY field ORDER BY field").all(userId) as Array<Record<string, unknown>>; writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: aiParameterIds(rows), allowed: aiParameterIds(rows), denied: [], count: rows.length, status: "allowed" }); return json(response, 200, { items: rows.map((row) => ({ id: String(row.field), name: String(row.field), sampleCount: Number(row.sample_count), lastObservedAt: String(row.last_observed_at) })) }); }
      if (parts.length === 4 && parts[2] === "parameters") { const parameterId = parts[3]; const row = db.prepare("SELECT field, COUNT(*) AS sample_count, MIN(created_at) AS first_observed_at, MAX(created_at) AS last_observed_at FROM observations o JOIN responses r ON r.id=o.response_id JOIN checkins c ON c.id=r.checkin_id WHERE c.user_id=? AND field=? GROUP BY field").get(userId, parameterId) as Record<string, unknown> | undefined; if (!row) return json(response, 404, { error: "parameter_not_found" }); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [parameterId], allowed: [parameterId], denied: [], count: 1, status: "allowed" }); return json(response, 200, { id: parameterId, name: parameterId, sampleCount: Number(row.sample_count), firstObservedAt: row.first_observed_at, lastObservedAt: row.last_observed_at }); }
      if (parts.length === 3 && parts[2] === "self-model") { const rows = db.prepare("SELECT statement,created_at FROM self_beliefs WHERE user_id=? ORDER BY created_at DESC LIMIT 10").all(userId) as Array<Record<string, unknown>>; writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: rows.length, status: "allowed" }); return json(response, 200, { items: rows }); }
      if (parts.length === 3 && parts[2] === "hypotheses") { const rows = db.prepare("SELECT id,statement,state,status,spec_version,created_at FROM hypotheses WHERE user_id=? AND state IN ('tracking','paused') ORDER BY created_at DESC").all(userId) as Array<Record<string, unknown>>; writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: rows.length, status: "allowed" }); return json(response, 200, { items: rows }); }
      if (parts.length === 4 && parts[2] === "hypotheses") { const row = db.prepare("SELECT id,statement,state,status,spec_json,spec_version,created_at FROM hypotheses WHERE user_id=? AND id=?").get(userId, parts[3]) as Record<string, unknown> | undefined; if (!row) return json(response, 404, { error: "hypothesis_not_found" }); const evaluation = db.prepare("SELECT result,cohort_metrics_json,observed_effect,data_quality_json,evaluated_at FROM hypothesis_evaluations WHERE hypothesis_id=? ORDER BY created_at DESC LIMIT 1").get(parts[3]); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: 1, status: "allowed" }); return json(response, 200, { ...row, spec_json: undefined, evaluation: evaluation ?? null }); }
      if (parts.length === 5 && parts[2] === "hypotheses" && parts[4] === "evidence") { if (!db.prepare("SELECT 1 FROM hypotheses WHERE user_id=? AND id=?").get(userId, parts[3])) return json(response, 404, { error: "hypothesis_not_found" }); const rows = db.prepare("SELECT e.direction,e.rule_version,e.created_at,o.field,o.value_json FROM evidence_links e JOIN observations o ON o.id=e.observation_id WHERE e.hypothesis_id=? ORDER BY e.created_at DESC").all(parts[3]); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: rows.length, status: "allowed" }); return json(response, 200, { items: rows }); }
      if (parts.length === 5 && parts[2] === "hypotheses" && parts[4] === "missing-parameters") { const row = db.prepare("SELECT spec_json FROM hypotheses WHERE user_id=? AND id=?").get(userId, parts[3]) as Record<string, unknown> | undefined; if (!row) return json(response, 404, { error: "hypothesis_not_found" }); const spec = row.spec_json ? JSON.parse(String(row.spec_json)) as Record<string, unknown> : {}; const fields = [...new Set([...(Array.isArray(spec.scope) ? spec.scope : []).map((item: any) => item.field), ...((Array.isArray(spec.cohorts) ? spec.cohorts : []).flatMap((cohort: any) => Array.isArray(cohort.conditions) ? cohort.conditions.map((item: any) => item.field) : [])), (spec.outcome as any)?.field].filter(Boolean))]; const items = fields.filter((field) => !db.prepare("SELECT 1 FROM observations o JOIN responses r ON r.id=o.response_id JOIN checkins c ON c.id=r.checkin_id WHERE c.user_id=? AND o.field=? LIMIT 1").get(userId, field)).map((parameterId) => ({ parameterId, reason: "no_observations" })); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: fields, allowed: fields, denied: [], count: items.length, status: "allowed" }); return json(response, 200, { items }); }
      if (parts.length === 3 && parts[2] === "snapshot") { const parameterIds = requestUrl.searchParams.getAll("parameterId"); const aggregate = parameterIds.length ? aiAggregate({ userId, clientId, clientType, purpose, parameterIds, startAt: requestUrl.searchParams.get("startAt") ?? new Date(Date.now() - 30 * 86400000).toISOString(), endAt: requestUrl.searchParams.get("endAt") ?? new Date().toISOString() }) : { accessLevel: "aggregate_only", groups: [], deniedParameterIds: [] }; const hypotheses = db.prepare("SELECT id,statement,state,status,created_at FROM hypotheses WHERE user_id=? AND state IN ('tracking','paused') ORDER BY created_at DESC").all(userId); return json(response, 200, { generatedAt: now(), accessLevel: "aggregate_only", hypotheses, aggregates: aggregate.groups, deniedParameterIds: aggregate.deniedParameterIds }); }
    }
    if (request.method === "POST" && parts.join("/") === "v1/ai/aggregates/query") return json(response, 200, aiAggregate(await body(request)));
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
