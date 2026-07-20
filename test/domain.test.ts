import test from "node:test";
import assert from "node:assert/strict";
import { chooseQuestion, evaluateEvidence, transitionHypothesis } from "../packages/domain/src/index.ts";

test("missing observations never become challenges", () => {
  const result = evaluateEvidence([
    { field: "outcome", value: null, certainty: "low", source: "user_confirmed", missing: true },
    { field: "outcome", value: "interrupted", certainty: "high", source: "user_confirmed" },
  ]);
  assert.equal(result.challenges, 1);
  assert.equal(result.insufficient, 1);
  assert.equal(result.status, "inconclusive");
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
