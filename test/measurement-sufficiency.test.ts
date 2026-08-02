import test from "node:test";
import assert from "node:assert/strict";
import { assessMeasurementSufficiency } from "../packages/domain/src/measurementSufficiency.ts";

const requirements = [{ semanticRole: "task_clarity", analysisUsage: "condition" as const, minimumSamples: 2 }, { semanticRole: "start_delay", analysisUsage: "outcome" as const, minimumSamples: 2 }];
const records = (confirmed = true) => Array.from({ length: 2 }, (_, index) => ({ id: `r${index}`, recordedAt: `2026-08-0${index + 1}T00:00:00.000Z`, values: [{ analysisRole: "task_clarity", analysisUsage: "condition", analysisRoleConfirmed: confirmed, value: 2, provenance: { userConfirmed: confirmed } }, { analysisRole: "start_delay", analysisUsage: "outcome", analysisRoleConfirmed: confirmed, value: 10, provenance: { userConfirmed: confirmed } }] }));

test("sufficiency distinguishes review, collection, and ready states", () => {
  assert.equal(assessMeasurementSufficiency({ requestStatus: "pending_user_review", requirements }).status, "waiting_for_template_review");
  const collecting = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records().slice(0, 1) }, startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-03T00:00:00.000Z" });
  assert.equal(collecting.status, "collecting");
  const ready = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records() }, startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-03T00:00:00.000Z" });
  assert.equal(ready.status, "ready_for_analysis");
  assert.deepEqual(ready.countsByRequirement, { task_clarity: 2, start_delay: 2 });
});

test("unconfirmed and out-of-range values are excluded", () => {
  const result = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records(false) }, startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-01T23:59:59.000Z" });
  assert.equal(result.status, "collecting");
  assert.ok(result.excluded.unconfirmed > 0);
  assert.ok(result.excluded.outOfPeriod > 0);
});

test("condition values derive deterministic group counts when groupKey is absent", () => {
  const result = assessMeasurementSufficiency({ requestStatus: "activated", requirements, snapshot: { records: records().map((record, index) => ({ ...record, values: record.values.map((value) => value.analysisRole === "task_clarity" ? { ...value, value: index } : value) })) }, minimumObservations: 2, minimumPerGroup: 1 });
  assert.deepEqual(result.groupCounts, { "task_clarity:0": 1, "task_clarity:1": 1 });
  assert.notEqual(result.status, "insufficient_group_balance");
});
