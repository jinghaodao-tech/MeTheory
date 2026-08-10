import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExperiment, reviewReasonAction, selfModelFreshness } from "../packages/domain/src/index.ts";

function strong(value: number) { return Array.from({ length: 21 }, () => value); }

function rows(valuesA: number[], valuesB: number[], conditionValues?: Record<string, unknown>) {
  return [
    ...valuesA.map((outcome, index) => ({ id: `a-${index}`, experimentId: "synthetic", observedAt: `2026-07-${10 + index}T09:00:00.000Z`, groupKey: "a", outcome, source: "manual" as const, eligible: true, conditionValues })),
    ...valuesB.map((outcome, index) => ({ id: `b-${index}`, experimentId: "synthetic", observedAt: `2026-07-${10 + index}T10:00:00.000Z`, groupKey: "b", outcome, source: "manual" as const, eligible: true, conditionValues }))
  ];
}

test("closed-loop synthetic scenarios cover support, challenge, adherence, shortage, context and freshness", () => {
  const supported = evaluateExperiment({ experimentId: "support", observations: rows(strong(1), strong(0)), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(supported.status, "supported");

  const challenged = evaluateExperiment({ experimentId: "challenge", observations: rows(strong(0), strong(1)), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(challenged.status, "challenged");

  const lowAdherence = evaluateExperiment({ experimentId: "adherence", observations: rows([1, 1, 1, 1], [0, 0, 0, 0], { interventionAttempted: false }), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2, kind: "behavioral_intervention" });
  assert.equal(lowAdherence.status, "insufficient_data");
  const partialAdherence = evaluateExperiment({ experimentId: "partial-adherence", observations: rows([5, 5, 5], [1, 1, 1]).map((item, index) => index === 0 ? { ...item, conditionValues: { interventionAttempted: true } } : item), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 6, expectedDirection: "a_greater", minimumEffect: 0.2, kind: "behavioral_intervention" });
  assert.equal(partialAdherence.status, "insufficient_data");
  assert.equal(evaluateExperiment({ experimentId: "invalid-direction", observations: rows([5, 5, 5], [1, 1, 1]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 6, expectedDirection: "invalid" as never, minimumEffect: 0.2 }).status, "invalid");

  const shortage = evaluateExperiment({ experimentId: "shortage", observations: rows([1, 1], [0, 0]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(shortage.status, "insufficient_data");
  assert.ok(shortage.missingData.length > 0);
  const unsafeMinimums = evaluateExperiment({ experimentId: "unsafe-minimums", observations: rows([1], [0]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 1, minimumObservations: 2, expectedDirection: "a_greater", minimumEffect: 0 });
  assert.equal(unsafeMinimums.status, "insufficient_data");

  const contextDependent = evaluateExperiment({ experimentId: "context", observations: rows(strong(1), strong(0)), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.ok(contextDependent.sensitivitySummary.explanation.length > 0);
  const reversedContext = evaluateExperiment({ experimentId: "context-reversed", observations: rows(strong(0), strong(1)), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(reversedContext.status, "challenged");
  const unbalanced = evaluateExperiment({ experimentId: "unbalanced", observations: rows([5, 5, 5], Array.from({ length: 13 }, () => 1)), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 6, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(unbalanced.status, "insufficient_data");
  const mostlyExcluded = [
    ...rows([5, 5, 5], [1, 1, 1]),
    ...Array.from({ length: 7 }, (_, index) => ({ id: `excluded-${index}`, experimentId: "excluded", observedAt: "2026-07-20T09:00:00.000Z", groupKey: "a", outcome: 5, source: "manual" as const, eligible: false }))
  ];
  assert.equal(evaluateExperiment({ experimentId: "excluded", observations: mostlyExcluded, groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 6, expectedDirection: "a_greater", minimumEffect: 0.2 }).status, "insufficient_data");

  assert.equal(reviewReasonAction("depends_on_context").action, "split_context");

  assert.equal(selfModelFreshness({ lastReviewedAt: "2026-07-01T00:00:00.000Z", supportingEvidenceCount: 2, contradictingEvidenceCount: 3, now: "2026-07-30T00:00:00.000Z" }), "possibly_changed");
});