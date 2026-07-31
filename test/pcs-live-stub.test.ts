import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createPcsStubServer, type PcsStubMode } from "../apps/api/src/pcsStubServer.ts";
import { fetchLiveSnapshot, PcsClientError } from "../apps/api/src/pcsClient.ts";
import type { PcsAnalysisSnapshotV2 } from "../packages/contracts/src/pcsAnalysisSnapshotV2.ts";

const snapshot: PcsAnalysisSnapshotV2 = { schemaVersion: "pcs-analysis-snapshot-v2", snapshotId: "stub", profileId: "p", period: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z", timezone: "UTC" }, records: [{ recordId: "r", recordedAt: "2026-07-01T12:00:00.000Z", templateId: "t", templateVersionId: "v", fieldKey: "clarity", valueType: "number", value: 3, analysisRole: "task_clarity", analysisRoleConfirmed: true, analysisUsage: "condition", analysisMergeAllowed: false }] };
async function withStub(mode: PcsStubMode, run: () => Promise<void>) {
  const server = createPcsStubServer(snapshot, mode); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); process.env.PCS_API_URL = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`; process.env.PCS_CLIENT_ID = "test"; process.env.PCS_CLIENT_TOKEN = "token";
  try { await run(); } finally { server.close(); await once(server, "close"); }
}
test("Live PCS stub preserves the success and error contract", async () => {
  await withStub("ok", async () => assert.equal((await fetchLiveSnapshot({ profileId: "p", from: snapshot.period.from, to: snapshot.period.to, timezone: "UTC" })).snapshotId, "stub"));
  for (const [mode, code, status] of [["unauthorized", "pcs_unauthorized", 401], ["forbidden", "pcs_profile_forbidden", 403], ["invalid_snapshot", "pcs_snapshot_invalid", 502], ["unavailable", "pcs_unavailable", 502]] as const) await withStub(mode, async () => await assert.rejects(fetchLiveSnapshot({ profileId: "p", from: snapshot.period.from, to: snapshot.period.to, timezone: "UTC" }), (error: unknown) => error instanceof PcsClientError && error.code === code && error.status === status));
});
