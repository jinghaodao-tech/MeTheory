import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { PcsClientError, PcsIntegrationClient } from "../apps/api/src/personalContextClient.ts";
import { assertValidPcsAnalysisSnapshotV2 } from "../packages/contracts/src/pcsAnalysisSnapshotV2.ts";
import { analyzePcsAnalysisSnapshot } from "../packages/self-understanding/src/pcsSnapshotAnalysis.ts";

const snapshot = {
  schemaVersion: "pcs-analysis-snapshot-v2",
  contractRevision: "pcs-analysis-snapshot-v2.1",
  snapshotId: "cross-repo-snapshot-1",
  profileId: "profile-1",
  generatedAt: "2026-07-31T00:00:00.000Z",
  period: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-08-01T00:00:00.000Z", timezone: "Asia/Tokyo" },
  records: Array.from({ length: 12 }, (_, index) => ({
    id: `record-${index + 1}`,
    recordedAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    title: `Record ${index + 1}`,
    sourceDocumentId: `document-${index + 1}`,
    values: [{ fieldKey: "energy", label: "Energy", valueType: "number", value: index < 4 ? 2 : 4, templateId: "daily", templateVersionId: "daily-v1", analysisRole: "energy", analysisRoleConfirmed: true, analysisUsage: "outcome", analysisMergeAllowed: true, scaleFingerprint: "number-1-5", minimum: 1, maximum: 5, provenance: { source: "user_input", sourceId: `value-${index + 1}`, userConfirmed: true, recordedAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`, transformVersion: "pcs-v2.1-test", privacyLevel: "normal" } }]
  })),
  excluded: { unconfirmed: 0, nonShareable: 0, highlySensitive: 0, invalid: 0 }
};

for (const [index, record] of snapshot.records.entries()) {
  record.values[0] = { ...record.values[0], fieldKey: "start_delay", label: "Start delay", valueType: "duration_minutes", value: index < 6 ? 40 : 10, analysisRole: "start_delay", analysisUsage: "outcome", scaleFingerprint: "minutes-0-60", minimum: 0, maximum: 60 };
  record.values.unshift({ fieldKey: "task_clarity", label: "Task clarity", valueType: "number", value: index < 6 ? 2 : 4, templateId: "daily", templateVersionId: "daily-v1", analysisRole: "task_clarity", analysisRoleConfirmed: true, analysisUsage: "condition", analysisMergeAllowed: true, scaleFingerprint: "number-1-5", minimum: 1, maximum: 5, provenance: { source: "user_input", sourceId: `clarity-${index + 1}`, userConfirmed: true, recordedAt: record.recordedAt, transformVersion: "pcs-v2.1-test", privacyLevel: "normal" } });
}

test("PCS and MeTheory cross-repository contract flow validates and analyzes", async () => {
  const server = createServer((request, response) => {
    if (request.headers["x-pcs-client-id"] !== "client-1" || request.headers.authorization !== "Bearer token-1") { response.writeHead(401, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "integration_authorization_required" })); return; }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.searchParams.get("profileId") !== "profile-1") { response.writeHead(403, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "integration_profile_forbidden" })); return; }
    response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(snapshot));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const client = new PcsIntegrationClient({ baseUrl: `http://127.0.0.1:${address.port}`, clientId: "client-1", token: "token-1" });
    const received = assertValidPcsAnalysisSnapshotV2(await client.getAnalysisSnapshot({ profileId: "profile-1", from: snapshot.period.startAt, to: snapshot.period.endAt, timezone: snapshot.period.timezone }));
    const result = analyzePcsAnalysisSnapshot(received, { minimumTotalSamples: 8 });
    assert.equal(result.status, "ready", JSON.stringify(result));
    await assert.rejects(() => client.getAnalysisSnapshot({ profileId: "wrong-profile", from: snapshot.period.startAt, to: snapshot.period.endAt }), (error: unknown) => error instanceof PcsClientError && error.code === "pcs_profile_forbidden");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
