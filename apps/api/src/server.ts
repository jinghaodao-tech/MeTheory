import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateEvidence, directionForObservation, RULE_VERSION, type ObservationInput } from "../../../packages/domain/src/index.ts";

const root = resolve(import.meta.dirname, "../../..");
const databasePath = process.env.METHEORY_DB ?? resolve(root, "data", "metheory-ts.sqlite3");
const db = new DatabaseSync(databasePath);
db.exec(readFileSync(resolve(root, "db", "ts_mvp_schema.sql"), "utf8"));

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
  const question = kind === "random"
    ? { text: "What are you doing right now?", type: "single_choice", field: "activity_type", options: ["work", "rest", "move", "eat", "other"] }
    : { text: "What was the outcome of this activity?", type: "single_choice", field: "outcome", options: ["completed", "interrupted", "not_applicable"] };
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
  const observationId = id("obs");
  const payload = JSON.stringify(input);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO responses(id, checkin_id, idempotency_key, client_created_at, server_received_at, payload_json, missing_reason) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(responseId, checkinId, input.idempotencyKey as string, (input.clientCreatedAt as string | undefined) ?? now(), now(), payload, input.missingReason ?? null);
    const observation: ObservationInput = {
      field: checkin.kind === "random" ? "activity_type" : "outcome",
      value: (input.outcome as string | undefined) ?? (input.activityType as string | undefined) ?? null,
      certainty: input.missingReason ? "low" : "high",
      source: "user_confirmed",
      missing: Boolean(input.missingReason),
    };
    db.prepare("INSERT INTO observations(id, response_id, field, value_json, certainty, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(observationId, responseId, observation.field, JSON.stringify(observation.value), observation.certainty, observation.source, now());
    if (checkin.hypothesis_id) {
      db.prepare("INSERT INTO evidence_links(id, hypothesis_id, observation_id, direction, rule_version, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id("evidence"), checkin.hypothesis_id, observationId, directionForObservation(observation), RULE_VERSION, now());
      evaluateAndStore(checkin.hypothesis_id as string);
    }
    db.prepare("UPDATE checkins SET response_status = 'answered' WHERE id = ?").run(checkinId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: responseId, checkinId, idempotencyKey: input.idempotencyKey, observationId };
}

function evaluateAndStore(hypothesisId: string): void {
  const rows = db.prepare("SELECT o.field, o.value_json, o.certainty, o.source FROM evidence_links e JOIN observations o ON o.id = e.observation_id WHERE e.hypothesis_id = ? AND e.rule_version = ? ORDER BY o.created_at")
    .all(hypothesisId, RULE_VERSION) as Array<Record<string, unknown>>;
  const observations: ObservationInput[] = rows.map((row) => ({ field: row.field as string, value: JSON.parse(row.value_json as string), certainty: row.certainty as "high" | "medium" | "low", source: row.source as "user_confirmed" | "ai_inferred" | "system" }));
  const evaluation = evaluateEvidence(observations);
  db.prepare("INSERT INTO hypothesis_evaluations(id, hypothesis_id, rule_version, status, support_count, challenge_count, insufficient_count, sample_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id("eval"), hypothesisId, evaluation.ruleVersion, evaluation.status, evaluation.supports, evaluation.challenges, evaluation.insufficient, evaluation.sampleSize, now());
  db.prepare("UPDATE hypotheses SET status = ? WHERE id = ? AND status != 'archived'").run(evaluation.status, hypothesisId);
}

function latestInsight(hypothesisId: string): Record<string, unknown> | null {
  return db.prepare("SELECT h.id, h.statement, h.status, e.rule_version, e.status AS evaluation_status, e.support_count, e.challenge_count, e.insufficient_count, e.sample_size FROM hypotheses h LEFT JOIN hypothesis_evaluations e ON e.id = (SELECT id FROM hypothesis_evaluations WHERE hypothesis_id = h.id ORDER BY created_at DESC LIMIT 1) WHERE h.id = ?").get(hypothesisId) as Record<string, unknown> | null;
}

const server = createServer(async (request, response) => {
  const parts = pathParts(request);
  try {
    if (request.method === "GET" && parts.join("/") === "healthz") return json(response, 200, { status: "ok", service: "metheory-ts-api" });
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
      const hypothesisId = id("hyp"); db.prepare("INSERT INTO hypotheses(id, user_id, self_belief_id, template_key, statement, status, rule_version, created_at) VALUES (?, ?, ?, ?, ?, 'tracking', ?, ?)").run(hypothesisId, input.userId, input.selfBeliefId ?? null, input.templateKey ?? "belief_vs_observation", input.statement, RULE_VERSION, now());
      return json(response, 201, { id: hypothesisId, status: "tracking" });
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
