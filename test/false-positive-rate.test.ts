import test from "node:test";
import assert from "node:assert/strict";
import { generateSyntheticDataset } from "../packages/domain/src/syntheticData.ts";
import { generateHypothesisCandidates } from "../packages/domain/src/hypothesis/candidates.ts";
import { binaryRateSensitivity } from "../packages/domain/src/sensitivity.ts";

function parameters() {
  return [
    { id: "condition", nameJa: "条件", valueType: "boolean", usableAsCondition: true, usableAsOutcome: false },
    { id: "outcome", nameJa: "結果", valueType: "number", minimumValue: 1, maximumValue: 5, usableAsCondition: false, usableAsOutcome: true }
  ];
}

test("binary sensitivity reports the first change that crosses the effect floor", () => {
  const result = binaryRateSensitivity({ groupAPositive: 3, groupATotal: 4, groupBPositive: 2, groupBTotal: 4, minimumEffect: 0.2 });
  assert.deepEqual(result, { minimumChangesToCrossEffect: 1, changesByGroup: { groupA: 1, groupB: 1 } });
});

test("null-effect synthetic data stays below the five percent candidate rate", () => {
  let candidateRuns = 0;
  const runs = 200;
  for (let seed = 1; seed <= runs; seed += 1) {
    const dataset = generateSyntheticDataset({ scenario: "no_effect", count: 24, seed, startAt: "2026-01-01T00:00:00.000Z" });
    const candidates = generateHypothesisCandidates({
      parameters: parameters(),
      observations: dataset.observations,
      now: "2026-01-30T00:00:00.000Z",
      config: { lookbackDays: 365, comparisonCount: 1 }
    });
    if (candidates.length > 0) candidateRuns += 1;
  }
  assert.ok(candidateRuns / runs <= 0.05, "null-effect candidate rate was " + candidateRuns / runs);
});
