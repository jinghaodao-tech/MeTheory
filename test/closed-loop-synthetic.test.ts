import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExperiment, reviewReasonAction, selfModelFreshness } from "../packages/domain/src/index.ts";

function rows(valuesA: number[], valuesB: number[], conditionValues?: Record<string, unknown>) {
  return [
    ...valuesA.map((outcome, index) => ({ id: `a-${index}`, experimentId: "synthetic", observedAt: `2026-07-${10 + index}T09:00:00.000Z`, groupKey: "a", outcome, source: "manual" as const, eligible: true, conditionValues })),
    ...valuesB.map((outcome, index) => ({ id: `b-${index}`, experimentId: "synthetic", observedAt: `2026-07-${10 + index}T10:00:00.000Z`, groupKey: "b", outcome, source: "manual" as const, eligible: true, conditionValues }))
  ];
}

test("closed-loop synthetic scenarios cover support, challenge, adherence, shortage, context and freshness", () => {
  const supported = evaluateExperiment({ experimentId: "support", observations: rows([1, 1, 1, 1], [0, 0, 0, 0]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(supported.status, "supported");

  const challenged = evaluateExperiment({ experimentId: "challenge", observations: rows([0, 0, 0, 0], [1, 1, 1, 1]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(challenged.status, "challenged");

  const lowAdherence = evaluateExperiment({ experimentId: "adherence", observations: rows([1, 1, 1, 1], [0, 0, 0, 0], { interventionAttempted: false }), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2, kind: "behavioral_intervention" });
  assert.equal(lowAdherence.status, "insufficient_data");

  const shortage = evaluateExperiment({ experimentId: "shortage", observations: rows([1, 1], [0, 0]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(shortage.status, "insufficient_data");
  assert.ok(shortage.missingData.length > 0);

  const contextDependent = evaluateExperiment({ experimentId: "context", observations: rows([1, 1, 1, 1], [0, 0, 0, 0]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.ok(contextDependent.sensitivitySummary.explanation.length > 0);
  const reversedContext = evaluateExperiment({ experimentId: "context-reversed", observations: rows([0, 0, 0, 0], [1, 1, 1, 1]), groupAKey: "a", groupBKey: "b", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(reversedContext.status, "challenged");
  assert.equal(reviewReasonAction("depends_on_context").action, "split_context");

  assert.equal(selfModelFreshness({ lastReviewedAt: "2026-07-01T00:00:00.000Z", supportingEvidenceCount: 2, contradictingEvidenceCount: 3, now: "2026-07-30T00:00:00.000Z" }), "possibly_changed");
});
