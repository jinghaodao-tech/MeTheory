import test from "node:test";
import assert from "node:assert/strict";
import { chooseNotificationMinute, chooseQuestion, correctedAlpha, evaluateEvidence, exactPermutationPValue, transitionHypothesis, validateAiCandidate } from "../packages/domain/src/index.ts";

test("missing observations never become challenges", () => {
  const result = evaluateEvidence([
    { field: "outcome", value: null, certainty: "low", source: "user_confirmed", missing: true },
    { field: "outcome", value: "interrupted", certainty: "high", source: "user_confirmed" },
  ]);
  assert.equal(result.challenges, 1);
  assert.equal(result.insufficient, 1);
  assert.equal(result.status, "inconclusive");
});

test("directional evidence requires an exact binomial result at the five percent floor", () => {
  const observation = (value: boolean) => ({ field: "outcome", value, certainty: "high" as const, source: "user_confirmed" as const });
  assert.equal(evaluateEvidence([observation(true), observation(true)]).status, "inconclusive");
  assert.equal(evaluateEvidence([observation(true), observation(true), observation(true)]).status, "inconclusive");
  assert.equal(evaluateEvidence([observation(true), observation(true), observation(true), observation(false), observation(false)]).status, "inconclusive");
  assert.equal(evaluateEvidence(Array.from({ length: 20 }, () => observation(true))).status, "supported");
  assert.equal(evaluateEvidence(Array.from({ length: 20 }, () => observation(false))).status, "challenged");
});
test("directional evidence rejects excessive unknown values", () => {
  const known = { field: "outcome", value: true, certainty: "high" as const, source: "user_confirmed" as const };
  const unknown = { field: "outcome", value: null, certainty: "low" as const, source: "user_confirmed" as const, missing: true };
  const mostlyUnknown = [
    ...Array.from({ length: 3 }, () => ({ ...known })),
    ...Array.from({ length: 4 }, () => ({ ...unknown }))
  ];
  assert.equal(evaluateEvidence(mostlyUnknown).status, "inconclusive");
});

test("exact significance uses a five percent family-wise floor", () => {
  const result = exactPermutationPValue([1, 1, 1], [0, 0, 0], "a_greater");
  assert.equal(result?.pValue, 0.05);
  assert.equal(correctedAlpha(1), 0.05);
  assert.equal(correctedAlpha(2), 0.025);
});

test("large numeric permutations use a deterministic Monte Carlo fallback", () => {
  const groupA = Array.from({ length: 20 }, (_, index) => index + 1);
  const groupB = Array.from({ length: 20 }, (_, index) => index + 21);
  const first = exactPermutationPValue(groupA, groupB, "a_greater");
  const second = exactPermutationPValue(groupA, groupB, "a_greater");
  assert.equal(first?.method, "monte_carlo_permutation");
  assert.deepEqual(first, second);
  assert.ok(first !== null && first.pValue >= 0 && first.pValue <= 1);
});


test("hypothesis transitions reject evaluation from proposed", () => {
  assert.equal(transitionHypothesis("tracking", "supported"), "supported");
  assert.throws(() => transitionHypothesis("proposed", "supported"));
});

test("adaptive question selection is deterministic", () => {
  const result = chooseQuestion([
    { field: "mood", burden: 1, novelty: 1, informationGainProxy: 2, hypothesisPriority: 1, recentlyAsked: false },
    { field: "outcome", burden: 1, novelty: 2, informationGainProxy: 2, hypothesisPriority: 1, recentlyAsked: false },
  ]);
  assert.equal(result?.field, "outcome");
});

test("notification policy respects windows, quiet hours, budget, and interval", () => {
  const base = {
    candidateMinutes: [480, 600, 720],
    allowedWindows: [{ startMinute: 420, endMinute: 800 }],
    quietWindows: [{ startMinute: 540, endMinute: 630 }],
    sentToday: 1,
    maxPerDay: 3,
    lastSentMinute: 450,
    minimumIntervalMinutes: 90,
  } as const;
  assert.equal(chooseNotificationMinute(base), 720);
  assert.equal(chooseNotificationMinute({ ...base, sentToday: 3 }), null);
  assert.equal(chooseNotificationMinute({ ...base, allowedWindows: [{ startMinute: 900, endMinute: 1000 }] }), null);
});

test("AI candidates cannot set system-owned fields or use diagnostic language", () => {
  assert.deepEqual(validateAiCandidate({ statement: "A different start condition may be worth testing" }), { ok: true });
  assert.equal(validateAiCandidate({ statement: "This is a diagnosis" }).ok, false);
  assert.equal(validateAiCandidate({ statement: "A candidate", status: "supported" }).ok, false);
});
