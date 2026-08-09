import test from "node:test";
import assert from "node:assert/strict";
import { generateSyntheticDataset } from "../packages/domain/src/syntheticData.ts";
import { generateHypothesisCandidates } from "../packages/domain/src/hypothesis/candidates.ts";
import { binaryRateSensitivity } from "../packages/domain/src/sensitivity.ts";
import { evaluateExperiment } from "../packages/domain/src/experiments.ts";

function parameters() {
  return [
    { id: "condition", nameJa: "条件", valueType: "boolean", usableAsCondition: true, usableAsOutcome: false },
    { id: "outcome", nameJa: "結果", valueType: "number", minimumValue: 1, maximumValue: 5, usableAsCondition: false, usableAsOutcome: true }
  ];
}

function comparisonParameters(count: number) {
  return [
    { id: "condition", nameJa: "condition", valueType: "boolean", usableAsCondition: true, usableAsOutcome: false },
    ...Array.from({ length: count }, (_, index) => ({ id: `outcome-${index}`, nameJa: `outcome-${index}`, valueType: "number", minimumValue: 1, maximumValue: 5, usableAsCondition: false, usableAsOutcome: true }))
  ];
}

test("binary sensitivity reports the first change that crosses the effect floor", () => {
  const result = binaryRateSensitivity({ groupAPositive: 3, groupATotal: 4, groupBPositive: 2, groupBTotal: 4, minimumEffect: 0.2 });
  assert.deepEqual(result, { minimumChangesToCrossEffect: 1, changesByGroup: { groupA: 1, groupB: 1 } });
});

test("null-effect synthetic data stays below the five percent candidate rate", () => {
  let candidateRuns = 0;
  const runs = 1000;
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

test("clear positive synthetic data has a minimum candidate detection rate", () => {
  let candidateRuns = 0;
  const runs = 1000;
  for (let seed = 1; seed <= runs; seed += 1) {
    const dataset = generateSyntheticDataset({ scenario: "clear_positive_effect", count: 16, seed, startAt: "2026-01-01T00:00:00.000Z" });
    const candidates = generateHypothesisCandidates({
      parameters: parameters(),
      observations: dataset.observations,
      now: "2026-01-30T00:00:00.000Z",
      config: { lookbackDays: 365 }
    });
    if (candidates.length > 0) candidateRuns += 1;
  }
  assert.ok(candidateRuns / runs >= 0.95, "clear-positive candidate detection rate was " + candidateRuns / runs);
});

test("automatic comparison counting applies Bonferroni correction to ten comparisons", () => {
  const conditionDataset = generateSyntheticDataset({ scenario: "clear_positive_effect", count: 16, seed: 1, startAt: "2026-01-01T00:00:00.000Z" });
  const observations = conditionDataset.observations.filter((item) => item.parameterId === "condition").map((item, index) => ({ ...item, episodeId: `comparison-episode-${index}` }));
  for (let outcomeIndex = 0; outcomeIndex < 10; outcomeIndex += 1) {
    const dataset = generateSyntheticDataset({ scenario: outcomeIndex === 0 ? "clear_positive_effect" : "no_effect", count: 16, seed: outcomeIndex + 1, startAt: "2026-01-01T00:00:00.000Z" });
    observations.push(...dataset.observations.filter((item) => item.parameterId === "outcome").map((item, index) => ({ ...item, episodeId: `comparison-episode-${index}`, parameterId: `outcome-${outcomeIndex}` })));
  }
  const candidates = generateHypothesisCandidates({ parameters: comparisonParameters(10), observations, now: "2026-01-30T00:00:00.000Z", config: { lookbackDays: 365 } });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].significanceAlpha, 0.005);
});

test("ten-comparison null-effect synthetic data stays below the five percent candidate rate", () => {
  let candidateRuns = 0;
  const runs = 1000;
  for (let seed = 1; seed <= runs; seed += 1) {
    const conditionDataset = generateSyntheticDataset({ scenario: "no_effect", count: 16, seed, startAt: "2026-01-01T00:00:00.000Z" });
    const observations = conditionDataset.observations.filter((item) => item.parameterId === "condition").map((item, index) => ({ ...item, episodeId: `multi-episode-${index}` }));
    for (let outcomeIndex = 0; outcomeIndex < 10; outcomeIndex += 1) {
      const dataset = generateSyntheticDataset({ scenario: "no_effect", count: 16, seed: seed * 100 + outcomeIndex + 1, startAt: "2026-01-01T00:00:00.000Z" });
      observations.push(...dataset.observations.filter((item) => item.parameterId === "outcome").map((item, index) => ({ ...item, episodeId: `multi-episode-${index}`, parameterId: `outcome-${outcomeIndex}` })));
    }
    const candidates = generateHypothesisCandidates({ parameters: comparisonParameters(10), observations, now: "2026-01-30T00:00:00.000Z", config: { lookbackDays: 365 } });
    if (candidates.length > 0) candidateRuns += 1;
  }
  assert.ok(candidateRuns / runs <= 0.05, "ten-comparison null-effect candidate rate was " + candidateRuns / runs);
});

test("null-effect public experiment evaluation stays below the five percent conclusion rate", () => {
  let concludedRuns = 0;
  const runs = 1000;
  for (let seed = 1; seed <= runs; seed += 1) {
    let state = seed >>> 0;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000 >= 0.5 ? 1 : 0;
    };
    const observations = Array.from({ length: 8 }, (_, index) => ({
      id: `null-${seed}-${index}`,
      experimentId: "null-effect",
      observedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      groupKey: index < 4 ? "a" : "b",
      outcome: next(),
      source: "manual" as const,
      eligible: true
    }));
    const result = evaluateExperiment({
      experimentId: "null-effect",
      observations,
      groupAKey: "a",
      groupBKey: "b",
      minimumPerGroup: 3,
      minimumObservations: 8,
      expectedDirection: "a_greater",
      minimumEffect: 0.1
    });
    if (result.status === "supported" || result.status === "challenged") concludedRuns += 1;
  }
  assert.ok(concludedRuns / runs <= 0.05, "null-effect experiment conclusion rate was " + concludedRuns / runs);
});
