import test from "node:test";
import assert from "node:assert/strict";
import { assessMeasurementSufficiency } from "../packages/domain/src/measurementSufficiency.ts";

const requirements = [{ semanticRole: "task_clarity", analysisUsage: "condition" as const, minimumSamples: 2 }, { semanticRole: "start_delay", analysisUsage: "outcome" as const, minimumSamples: 2 }];
const records = (confirmed = true) => Array.from({ length: 6 }, (_, index) => ({ id: `r${index}`, recordedAt: new Date(Date.UTC(2026, 7, index < 3 ? 1 : 2, index % 3)).toISOString(), values: [{ analysisRole: "task_clarity", analysisUsage: "condition", analysisRoleConfirmed: confirmed, value: index < 3 ? 0 : 1, provenance: { userConfirmed: confirmed } }, { analysisRole: "start_delay", analysisUsage: "outcome", analysisRoleConfirmed: confirmed, value: 10, provenance: { userConfirmed: confirmed } }] }));

test("sufficiency distinguishes review, collection, and ready states", () => {
  assert.equal(assessMeasurementSufficiency({ requestStatus: "pending_user_review", requirements }).status, "waiting_for_template_review");
  const collecting = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records().slice(0, 1) }, startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-03T00:00:00.000Z" });
  assert.equal(collecting.status, "collecting");
  const ready = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records() }, startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-03T00:00:00.000Z" });
  assert.equal(ready.status, "ready_for_analysis");
  assert.deepEqual(ready.countsByRequirement, { task_clarity: 6, start_delay: 6 });
  assert.deepEqual(ready.minimumPerRequirement, { task_clarity: 3, start_delay: 3 });
});

test("unconfirmed and out-of-range values are excluded", () => {
  const result = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records(false) }, startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-01T23:59:59.000Z" });
  assert.equal(result.status, "ready_to_record");
  assert.ok(result.excluded.unconfirmed > 0);
  assert.ok(result.excluded.outOfPeriod > 0);
});

test("condition values derive deterministic group counts when groupKey is absent", () => {
  const result = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records() }, minimumObservations: 2, minimumPerGroup: 1 });
  assert.deepEqual(result.groupCounts, { "task_clarity:0": 3, "task_clarity:1": 3 });
  assert.notEqual(result.status, "insufficient_group_balance");
});
test("two observations cannot be marked ready by lowering request thresholds", () => {
  const result = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records().slice(0, 2) }, minimumObservations: 1, minimumPerGroup: 1 });
  assert.notEqual(result.status, "ready_for_analysis");
  assert.equal(result.minimumObservations, 6);
});
