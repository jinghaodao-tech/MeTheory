import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshotContentHash, validatePcsAnalysisSnapshotV2 } from "../packages/contracts/src/pcsAnalysisSnapshotV2.ts";

const snapshot = { schemaVersion: "pcs-analysis-snapshot-v2" as const, snapshotId: "snap-1", profileId: "profile-1", period: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z", timezone: "Asia/Tokyo" }, records: [{ recordId: "r1", recordedAt: "2026-07-01T12:00:00.000Z", templateId: "t", templateVersionId: "v", fieldKey: "clarity", valueType: "number" as const, value: 4, analysisRole: "task_clarity", analysisRoleConfirmed: true, analysisUsage: "condition" as const, analysisMergeAllowed: false }] };
test("PCS Snapshot V2 validates and hashes deterministically", () => { const result = validatePcsAnalysisSnapshotV2(snapshot); assert.equal(result.ok, true); assert.equal(snapshotContentHash(snapshot), snapshotContentHash({ ...snapshot, records: [...snapshot.records] })); });
test("PCS Snapshot V2 rejects unconfirmed analyzed roles", () => { const result = validatePcsAnalysisSnapshotV2({ ...snapshot, records: [{ ...snapshot.records[0], analysisRoleConfirmed: false }] }); assert.deepEqual(result, { ok: false, error: "pcs_snapshot_role_unconfirmed" }); });
