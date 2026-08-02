import test from "node:test";
import assert from "node:assert/strict";
import { buildIntegrationTemplateRequest, resolveMeasurementRequirements } from "../packages/domain/src/measurementRequirements.ts";

const input = { hypothesisId: "hyp-1", purpose: "作業開始条件を確かめる", durationDays: 14, minimumObservations: 10, requirements: [
  { semanticRole: "start_delay", analysisUsage: "outcome", valueType: "duration_minutes", minimum: 0, maximum: 120, collectionTiming: "after_activity" },
  { semanticRole: "task_clarity", analysisUsage: "condition", valueType: "scale", minimum: 1, maximum: 5, collectionTiming: "before_activity" }
] };

test("measurement requirements are deterministic and sorted by semantic role", () => {
  const first = resolveMeasurementRequirements(input);
  const second = resolveMeasurementRequirements({ ...input, requirements: [...input.requirements].reverse() });
  assert.deepEqual(first, second);
  const request = buildIntegrationTemplateRequest(first, "2026-08-02T00:00:00.000Z");
  assert.equal(request.schemaVersion, "pcs-integration-template-request-v1");
  assert.equal(request.sourceReferenceId, "hyp-1");
  assert.deepEqual((request.requestedFields as Array<Record<string, unknown>>).map((field) => field.semanticRole), ["start_delay", "task_clarity"]);
});

test("duplicate, unknown, and unbounded requirements are rejected", () => {
  assert.throws(() => resolveMeasurementRequirements({ ...input, requirements: [...input.requirements, input.requirements[0]] }), /semantic_role/);
  assert.throws(() => resolveMeasurementRequirements({ ...input, requirements: [{ ...input.requirements[0], semanticRole: "diagnosis" }] }), /semantic_role/);
  assert.throws(() => resolveMeasurementRequirements({ ...input, requirements: [{ ...input.requirements[0], minimum: undefined, maximum: undefined }] }), /numeric_range/);
});
