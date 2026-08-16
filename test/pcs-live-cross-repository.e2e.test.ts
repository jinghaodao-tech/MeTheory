import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { analyzePcsAnalysisSnapshot } from "../packages/self-understanding/src/pcsSnapshotAnalysis.ts";

const pcsRoot = process.env.PCS_REPO_PATH;
test("real PCS to MeTheory snapshot flow", { skip: !pcsRoot ? "set PCS_REPO_PATH to run the cross-repository E2E" : false }, async () => {
  const root = mkdtempSync(join(tmpdir(), "metheory-pcs-live-"));
  const notes = join(root, "notes");
  const pcsPort = 19000 + (process.pid % 500);
  const mtPort = pcsPort + 1;
  const pcsDb = join(root, "pcs.sqlite3");
  const mtDb = join(root, "metheory.sqlite3");
  const children: ChildProcess[] = [];
  const start = (cwd: string, env: Record<string, string>) => { const args = cwd === pcsRoot ? ["--experimental-strip-types", "apps/api/src/server.ts"] : ["--experimental-strip-types", "apps/api/src/server.ts"]; const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: "ignore" }); children.push(child); return child; };
  const wait = async (url: string) => { for (let attempt = 0; attempt < 120; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch { /* service is starting */ } await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`service_not_ready:${url}`); };
  const request = async (base: string, path: string, method = "GET", value?: unknown, headers: Record<string, string> = {}) => { const response = await fetch(base + path, { method, headers: { ...(value === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: value === undefined ? undefined : JSON.stringify(value) }); const body = await response.json() as Record<string, any>; assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(body)}`); return body; };
  try {
    start(pcsRoot!, { PCS_PORT: String(pcsPort), PCS_DB: pcsDb, PCS_NOTES_DIR: notes });
    await wait(`http://127.0.0.1:${pcsPort}/health`);
    const pcs = `http://127.0.0.1:${pcsPort}`;
    const template = await request(pcs, "/v1/context-templates", "POST", { name: "Live", purpose: "self_understanding", fields: [
      { fieldKey: "clarity", label: "Clarity", valueType: "scale", required: true, displayOrder: 1, minimum: 1, maximum: 5, analysisRole: "task_clarity", analysisRoleConfirmed: true, analysisUsage: "condition", analysisMergeAllowed: true, sharingDefault: "purpose_only", sensitivity: "normal", reason: "condition" },
      { fieldKey: "delay", label: "Delay", valueType: "duration_minutes", required: true, displayOrder: 2, minimum: 0, maximum: 60, unit: "minutes", analysisRole: "start_delay", analysisRoleConfirmed: true, analysisUsage: "outcome", analysisMergeAllowed: true, sharingDefault: "purpose_only", sensitivity: "normal", reason: "outcome" }
    ] });
    await request(pcs, `/v1/context-templates/${template.item.id}/activate`, "POST", {});
    const purpose = await request(pcs, "/v1/sharing-purposes", "POST", { name: "live_e2e" });
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    for (let index = 0; index < 20; index += 1) { const entry = await request(pcs, "/v1/context-entries", "POST", { templateId: template.item.id, values: { clarity: index < 10 ? 2 : 4, delay: index < 10 ? 40 : 10 } }); for (const fieldKey of ["clarity", "delay"]) await request(pcs, `/v1/context-entries/${entry.id}/values/${fieldKey}/purposes`, "PUT", { purposeIds: [purpose.id] }); }
    const profile = await request(pcs, "/v1/context-profiles", "POST", { name: "Live profile", target: "metheory", purposeId: purpose.id, includedFields: [{ templateId: template.item.id, fieldKey: "clarity" }, { templateId: template.item.id, fieldKey: "delay" }] });
    const client = await request(pcs, "/v1/integration-clients", "POST", { name: "MeTheory", permissions: ["read_snapshot", "submit_template_request"], allowedProfileIds: [profile.id] });
    const snapshot = await request(pcs, `/v1/context/analysis-snapshot?profileId=${encodeURIComponent(profile.id)}&from=${encodeURIComponent(periodStart)}&to=${encodeURIComponent(periodEnd)}`, "GET", undefined, { "x-pcs-client-id": client.id, authorization: `Bearer ${client.token}` });
    assert.equal(snapshot.contractRevision, "pcs-analysis-snapshot-v2.1"); assert.equal(snapshot.profileId, profile.id); assert.equal(snapshot.records.length, 20);
    start(process.cwd(), { PORT: String(mtPort), METHEORY_DB: mtDb, PCS_API_URL: pcs, PCS_CLIENT_ID: client.id, PCS_CLIENT_TOKEN: client.token, PCS_PROFILE_ID: profile.id });
    await wait(`http://127.0.0.1:${mtPort}/healthz`);
    const db = new DatabaseSync(mtDb); db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("live-user", "live-user-subject", "ja-JP", "Asia/Tokyo", "2026-07-01T00:00:00.000Z"); db.close();
    const binding = await request(`http://127.0.0.1:${mtPort}`, "/v1/pcs/profile-binding", "POST", { userId: "live-user", profileId: profile.id });
    assert.equal(binding.binding.pcsProfileId, profile.id);
    const createdHypothesis = await request(`http://127.0.0.1:${mtPort}`, "/v1/hypotheses", "POST", { userId: "live-user", statement: "明確さと開始までの時間の関係を確認する", spec: { schemaVersion: "1", unit: "response", scope: [], cohorts: [{ key: "clear", conditions: [{ field: "task_clarity", operator: "greater_than_or_equal", value: 4 }] }, { key: "unclear", conditions: [{ field: "task_clarity", operator: "less_than_or_equal", value: 2 }] }], outcome: { field: "start_delay", metric: "numeric_mean_difference", minimumValue: 0, maximumValue: 120 }, expectation: { relation: "cohort_a_less_than_b", minimumEffect: 5 }, evaluationPolicy: { captureModes: ["momentary_observation"], acceptedSources: ["user_confirmed"], minimumSamplesPerCohort: 10, maximumCohortRatio: 2, windowDays: 45, excludeLowCertainty: false, maximumMissingRate: 0.2 } } });
    const templateRequest = await request(`http://127.0.0.1:${mtPort}`, `/v1/hypotheses/${createdHypothesis.id}/pcs-template-request`, "POST", { userId: "live-user", purpose: "self_understanding", send: true });
    assert.equal(templateRequest.request.status, "pending_user_review");
    const requestId = templateRequest.request.pcsRequestId;
    const reusedTemplate = await request(pcs, `/v1/integration-template-requests/${requestId}/create-template`, "POST");
    assert.equal(reusedTemplate.reusedOnly, true); assert.equal(reusedTemplate.result.matchedFields.length, 2); assert.equal(reusedTemplate.result.createdFields.length, 0);
    await request(pcs, `/v1/integration-template-requests/${requestId}/approve`, "POST", {});
    const activated = await request(pcs, `/v1/integration-template-requests/${requestId}/activate`, "POST", {});
    assert.equal(activated.status, "activated");
    const partialPayload = { schemaVersion: "pcs-integration-template-request-v1", id: "live_partial_1", sourceSystem: "metheory", sourceReferenceId: "live_hypothesis_partial", title: "Partial request", purpose: "self_understanding", durationDays: 7, requestedFields: [{ fieldKey: "task_clarity", label: "Clarity", valueType: "scale", required: true, semanticRole: "task_clarity", analysisUsage: "condition", minimum: 1, maximum: 5, sharingDefault: "purpose_only", sensitivity: "normal", reason: "condition" }, { fieldKey: "completion", label: "Completion", valueType: "number", required: true, semanticRole: "completion", analysisUsage: "outcome", minimum: 0, maximum: 1, sharingDefault: "purpose_only", sensitivity: "normal", reason: "new outcome" }], createdAt: "2026-07-01T00:00:00.000Z" };
    const partial = await request(pcs, "/v1/integration-template-requests", "POST", partialPayload, { "x-pcs-client-id": client.id, authorization: `Bearer ${client.token}` });
    const partialDuplicate = await request(pcs, "/v1/integration-template-requests", "POST", partialPayload, { "x-pcs-client-id": client.id, authorization: `Bearer ${client.token}` });
    assert.equal(partialDuplicate.duplicate, true);
    const partialTemplate = await request(pcs, `/v1/integration-template-requests/${partial.id}/create-template`, "POST");
    assert.equal(partialTemplate.template.status, "draft"); assert.deepEqual(partialTemplate.template.fields.map((field: any) => field.field_key), ["completion"]);
    await request(pcs, `/v1/integration-template-requests/${partial.id}/approve_with_edits`, "POST", { edits: [{ fieldKey: "completion", questionText: "完了度を入力してください" }], confirmedAnalysisFields: [{ fieldKey: "completion", analysisRole: "completion", analysisUsage: "outcome", analysisMergeAllowed: true }] });
    assert.equal((await request(pcs, `/v1/integration-template-requests/${partial.id}/activate`, "POST", {})).status, "activated");
    const incompatiblePayload = { ...partialPayload, id: "live_incompatible_1", sourceReferenceId: "live_hypothesis_incompatible", requestedFields: [{ ...partialPayload.requestedFields[0], valueType: "text", fieldKey: "clarity_text" }] };
    const incompatible = await request(pcs, "/v1/integration-template-requests", "POST", incompatiblePayload, { "x-pcs-client-id": client.id, authorization: `Bearer ${client.token}` });
    const incompatibleDecision = await request(pcs, `/v1/integration-template-requests/${incompatible.id}/create-template`, "POST");
    assert.equal(incompatibleDecision.requiresUserDecision, true); assert.equal(incompatibleDecision.reusedOnly, false);
    assert.equal((await request(pcs, `/v1/integration-template-requests/${incompatible.id}/reject`, "POST", { reason: "incompatible field requires review" })).status, "rejected");
    const sufficiency = await request(`http://127.0.0.1:${mtPort}`, `/v1/hypotheses/${createdHypothesis.id}/data-sufficiency?userId=live-user&startAt=${encodeURIComponent(periodStart)}&endAt=${encodeURIComponent(periodEnd)}&minimumObservations=20`);
    assert.equal(sufficiency.status, "ready_for_analysis"); assert.equal(sufficiency.usableObservations, 20); assert.equal(sufficiency.requestStatus, "activated");
    const result = await request(`http://127.0.0.1:${mtPort}`, "/v1/self-understanding/analyze-personal-context", "POST", { userId: "live-user", profileId: profile.id, minimumEntryCount: 8, startAt: periodStart, endAt: periodEnd });
    assert.equal(result.status, "ready");
    assert.ok(Array.isArray(result.hypotheses) && result.hypotheses.length >= 1);
    const analyzedHypothesis = result.hypotheses[0]; const interpretation = analyzedHypothesis.interpretationInput ?? analyzedHypothesis.interpretation; if (!interpretation?.condition || !interpretation?.outcome) throw new Error(`interpretation_shape:${JSON.stringify({ keys: Object.keys(interpretation ?? {}), hypothesis: analyzedHypothesis })}`);
    assert.equal(interpretation.condition.semanticRole, "task_clarity");
    assert.equal(interpretation.outcome.semanticRole, "start_delay");
    assert.ok(interpretation.statistics.groupACount >= 2);
    assert.ok(interpretation.statistics.groupBCount >= 2);
    assert.notEqual(interpretation.statistics.difference, 0);
    assert.equal(interpretation.statistics.groupACount, 10);
    assert.equal(interpretation.statistics.groupBCount, 10);
    assert.deepEqual(new Set([interpretation.statistics.groupAValue, interpretation.statistics.groupBValue]), new Set([10, 40]));
    assert.equal(Math.abs(interpretation.statistics.difference), 30);
    assert.ok(analyzedHypothesis.supportingEntryIds.length > 0);
    assert.ok(Array.isArray(analyzedHypothesis.supportingEvidence) && analyzedHypothesis.supportingEvidence.length > 0);
    assert.equal(result.dataQuality.excludedValueCount, 0);
    assert.equal(interpretation.statistics.missingRate, 0);
    assert.equal(result.dataQuality.usableValueCount, 40);
    assert.ok(Array.isArray(analyzedHypothesis.contradictingEvidence));
  } finally { for (const child of children) child.kill(); await new Promise((resolve) => setTimeout(resolve, 100)); rmSync(root, { recursive: true, force: true }); }
});
