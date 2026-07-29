import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ActivityWatchAdapter, normalizeActivityWatchEvent, summarizeActivityWatchDaily } from "../packages/domain/src/activitywatch.ts";
import { createBaselineResponse, baselineItems } from "../packages/self-understanding/src/baseline.ts";
import { validateQuestionQuality } from "../packages/self-understanding/src/questionQuality.ts";
import { buildFixedChartModel } from "../packages/self-understanding/src/visualization.ts";
import { validateValueProvenance } from "../packages/domain/src/provenance.ts";
import { deterministicInterpretation, type SelfUnderstandingInterpretationInputV2 } from "../packages/self-understanding/src/index.ts";
import { SELF_UNDERSTANDING_INTERPRETATION_SCHEMA_VERSION, validateSelfUnderstandingStructuredOutput } from "../packages/self-understanding/src/structuredOutput.ts";

const interpretationInput: SelfUnderstandingInterpretationInputV2 = {
  version: 2,
  candidateId: "candidate_1",
  construct: { key: "task_initiation", labelJa: "作業開始", descriptionJa: "作業を始める条件" },
  tendencyScope: "single_period_state",
  period: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-07-14T00:00:00.000Z" },
  condition: { fieldKey: "task_clarity", label: "予定の明確さ", semanticRole: "task_clarity", groupA: "明確", groupB: "曖昧" },
  outcome: { fieldKey: "start_delay", label: "開始までの時間", semanticRole: "start_delay" },
  statistics: { groupACount: 4, groupBCount: 4, groupAValue: 10, groupBValue: 20, difference: -10, normalizedEffect: 0.3, sampleBalance: 1, missingRate: 0, temporalStability: "unknown", repeatedPeriodCount: 1 },
  status: "emerging",
  supportingEntries: [{ entryId: "entry_1", recordedAt: "2026-07-02T00:00:00.000Z", title: "記録" }],
  contradictingEntries: [],
  alternativeExplanations: ["疲労"],
  mergedCandidateIds: []
};

test("V3 structured interpretation is strict and uses the existing semantic boundary", () => {
  const result = validateSelfUnderstandingStructuredOutput({ ...deterministicInterpretation(interpretationInput), schemaVersion: SELF_UNDERSTANDING_INTERPRETATION_SCHEMA_VERSION }, { input: interpretationInput });
  assert.equal(result.valid, true);
  assert.equal(validateSelfUnderstandingStructuredOutput({ ...result.value, extra: true }, { input: interpretationInput }).valid, false);
  assert.equal(validateSelfUnderstandingStructuredOutput({ ...result.value, schemaVersion: "V2" }, { input: interpretationInput }).valid, false);
});

test("ActivityWatch adapter is localhost-only and discards AFK and raw private fields", async () => {
  assert.throws(() => new ActivityWatchAdapter({ baseUrl: "https://example.invalid" }), /localhost_only/);
  const observation = normalizeActivityWatchEvent("aw-watcher-window", { id: "event-1", timestamp: "2026-07-28T10:00:00.000Z", duration: 120, data: { app: "Code.exe", title: "secret-note.md", project: "MeTheory" } });
  assert.equal(observation?.category, "coding");
  assert.equal(observation?.sourceEventId, "event-1");
  assert.equal("title" in (observation ?? {}), false);
  const heartbeat = normalizeActivityWatchEvent("aw-watcher-window", { id: 1, timestamp: "2026-07-28T10:00:00.000Z", duration: 10, data: { app: "Code.exe" } });
  const updatedHeartbeat = normalizeActivityWatchEvent("aw-watcher-window", { id: 1, timestamp: "2026-07-28T10:00:00.000Z", duration: 20, data: { app: "Code.exe" } });
  assert.equal(heartbeat?.sourceEventId, "1");
  assert.notEqual(heartbeat?.id, updatedHeartbeat?.id);
  assert.equal(normalizeActivityWatchEvent("aw-watcher-afk", { timestamp: "2026-07-28T10:00:00.000Z", duration: 30, data: { status: "afk" } }), null);
  const summary = summarizeActivityWatchDaily([observation!]);
  assert.deepEqual(summary[0] && { date: summary[0].localDate, coding: summary[0].codingDurationSeconds, sessions: summary[0].sessionCount }, { date: "2026-07-28", coding: 120, sessions: 1 });
  const adapter = new ActivityWatchAdapter({ fetchImpl: async (url) => new Response(url.endsWith("/api/0/buckets") ? JSON.stringify({ "aw-watcher-window": { type: "window" } }) : JSON.stringify({ hostname: "local" }), { status: 200, headers: { "content-type": "application/json" } }) });
  assert.equal((await adapter.status()).running, true);
  assert.equal((await adapter.buckets())[0].id, "aw-watcher-window");
  const uiResponseAdapter = new ActivityWatchAdapter({ fetchImpl: async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }) });
  assert.equal((await uiResponseAdapter.status()).running, false);
});

test("baseline self-perception uses an independent version and explicit validation", () => {
  assert.equal(baselineItems().length, 10);
  assert.throws(() => createBaselineResponse({ id: "b1", itemKey: "starting_tasks", response: 6 }), /invalid/);
  const response = createBaselineResponse({ id: "b1", itemKey: "starting_tasks", response: 4 });
  assert.equal(response.source, "baseline_self_perception");
  assert.equal(response.useForSelfUnderstanding, true);
  assert.match(response.originalItemReference ?? "", /not an official/);
});

test("question quality and fixed charts reject unsafe or deceptive inputs", () => {
  assert.equal(validateQuestionQuality({ text: "あなたはきっと集中できない性格ですか？", timeReference: "今", subject: "自分" }).valid, false);
  assert.equal(validateQuestionQuality({ text: "今の作業開始までの時間は何分でしたか？", timeReference: "今", subject: "作業" }).valid, true);
  const chart = buildFixedChartModel({ kind: "time_series", title: "疲労", sampleCount: 2, series: [{ key: "fatigue", label: "疲労", points: [{ recordedAt: "2026-07-01", value: null }, { recordedAt: "2026-07-02", value: 3 }] }] });
  assert.equal(chart.series[0].points[0].value, null);
  assert.match(chart.notes[0], /欠損/);
});

test("provenance uses the shared source allowlist and rejects prohibited values", () => {
  assert.deepEqual(validateValueProvenance({ source: "activitywatch", recordedAt: "2026-07-28T00:00:00.000Z", userConfirmed: true, transformVersion: "activitywatch-v1", privacyLevel: "normal" }), []);
  assert.deepEqual(validateValueProvenance({ source: "manual_import", recordedAt: "2026-07-28T00:00:00.000Z", userConfirmed: false, transformVersion: "manual-v1", privacyLevel: "prohibited" }), ["prohibited_value"]);
});

test("new SQLite schema includes provenance tables and remains idempotent", () => {
  const db = new DatabaseSync(":memory:");
  const schema = readFileSync("db/ts_mvp_schema.sql", "utf8");
  db.exec(schema);
  db.exec(schema);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_observations'").get());
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='sqlite_autoindex_external_observations_2'").get(), undefined);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='baseline_self_perceptions'").get());
  db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("external-assets-user", "external-assets-test", "ja-JP", "Asia/Tokyo", "2026-07-28T00:00:00.000Z");
  db.prepare("INSERT INTO external_observations(id,user_id,source,observed_at,semantic_role,category,privacy_level,imported_at,transform_version) VALUES(?,?,?,?,?,?,?,?,?)").run("external-assets-observation", "external-assets-user", "activitywatch", "2026-07-28T10:00:00.000Z", "observed_behavior", "coding", "normal", "2026-07-28T10:01:00.000Z", "activitywatch-v1");
  assert.deepEqual({ ...(db.prepare("SELECT user_confirmed,review_state FROM external_observations WHERE id=?").get("external-assets-observation") as object) }, { user_confirmed: 0, review_state: "imported" });
  db.close();
});
