import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDataCollectionPlan,
  createExperimentDraftFromCandidate,
  evaluateExperiment,
  reviewReasonAction,
  selfModelFreshness,
  transitionExperiment
} from "../packages/domain/src/index.ts";

const candidate = {
  id: "candidate-night-completion",
  conditionParameterId: "time_period",
  outcomeParameterId: "completion_status",
  conditionLabel: "時間帯",
  outcomeLabel: "完了状態",
  cohortAKey: "evening",
  cohortBKey: "morning",
  cohortALabel: "夜",
  cohortBLabel: "朝",
  effectValue: 0.3,
  sampleCount: 12
};

test("experiment draft is deterministic and non-diagnostic", () => {
  const draft = createExperimentDraftFromCandidate({ id: "draft-1", candidate, now: "2026-07-30T00:00:00.000Z" });
  assert.equal(draft.status, "draft");
  assert.equal(draft.minimumPerGroup, 3);
  assert.match(draft.statement, /可能性/);
  assert.ok(draft.safetyNotes.some((note) => note.includes("診断")));
});

test("experiment lifecycle rejects invalid transitions", () => {
  assert.equal(transitionExperiment("draft", "ready"), "ready");
  assert.equal(transitionExperiment("active", "paused"), "paused");
  assert.throws(() => transitionExperiment("draft", "completed"), /experiment_transition_invalid/);
});

test("evaluation separates supported outcome from insufficient adherence", () => {
  const observations = [
    ...Array.from({ length: 21 }, (_, index) => ({ id: `a${index}`, experimentId: "exp-1", observedAt: `2026-07-${10 + index}T09:00:00.000Z`, groupKey: "evening", outcome: 1, source: "checkin" as const, eligible: true })),
    ...Array.from({ length: 21 }, (_, index) => ({ id: `b${index}`, experimentId: "exp-1", observedAt: `2026-07-${10 + index}T10:00:00.000Z`, groupKey: "morning", outcome: 0, source: "checkin" as const, eligible: true }))
  ];
  const result = evaluateExperiment({ experimentId: "exp-1", observations, groupAKey: "evening", groupBKey: "morning", minimumPerGroup: 3, minimumObservations: 42, expectedDirection: "a_greater", minimumEffect: 0.2 });
  assert.equal(result.status, "supported");
  assert.equal(result.effectSummary.difference, 1);
  assert.equal(result.supportingObservationIds.length, 42);

  const intervention = observations.map((item) => ({ ...item, conditionValues: { interventionAttempted: false } }));
  const insufficient = evaluateExperiment({ experimentId: "exp-2", observations: intervention, groupAKey: "evening", groupBKey: "morning", minimumPerGroup: 3, minimumObservations: 8, expectedDirection: "a_greater", minimumEffect: 0.2, kind: "behavioral_intervention" });
  assert.equal(insufficient.status, "insufficient_data");
});

test("collection plan only asks for missing user fields and can create a PCS request", () => {
  const plan = buildDataCollectionPlan({
    id: "plan-1",
    sourceAnalysisId: "analysis-1",
    targetConstruct: "task_initiation",
    requirements: [
      { parameterId: "energy_level", label: "エネルギー", minimumSamples: 3, askable: true, preferredSource: "user" },
      { parameterId: "activity_duration", label: "活動時間", minimumSamples: 3, askable: false, preferredSource: "device" }
    ],
    counts: { energy_level: 1, activity_duration: 3 },
    includePcsTemplateRequest: true
  });
  assert.deepEqual(plan.shortages, [{ key: "energy_level", needed: 2, reason: "ユーザー回答が必要" }]);
  assert.equal(plan.suggestedQuestions.length, 1);
  assert.deepEqual(plan.pcsTemplateRequest?.requiredFields, ["energy_level"]);
});

test("hypothesis review reasons are explicit rules", () => {
  assert.equal(reviewReasonAction("depends_on_context").action, "split_context");
  assert.equal(reviewReasonAction("privacy_concern").action, "exclude_sensitive");
  assert.equal(reviewReasonAction("too_burdensome").action, "shorten_experiment");
});

test("self model freshness is reviewable and never auto-updated", () => {
  assert.equal(selfModelFreshness({ lastReviewedAt: "2026-07-01T00:00:00.000Z", reviewDueAt: "2026-07-29T00:00:00.000Z", supportingEvidenceCount: 4, contradictingEvidenceCount: 0, now: "2026-07-30T00:00:00.000Z" }), "review_due");
  assert.equal(selfModelFreshness({ lastReviewedAt: "2026-07-01T00:00:00.000Z", supportingEvidenceCount: 2, contradictingEvidenceCount: 4, now: "2026-07-30T00:00:00.000Z" }), "possibly_changed");
  assert.equal(selfModelFreshness({ lastReviewedAt: "2026-07-01T00:00:00.000Z", supportingEvidenceCount: 0, contradictingEvidenceCount: 0, now: "2026-07-30T00:00:00.000Z" }), "unsupported_recently");
});