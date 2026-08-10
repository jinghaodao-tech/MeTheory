import test from "node:test";
import assert from "node:assert/strict";
import { buildEpisodes, type EpisodeObservation } from "../packages/domain/src/hypothesis/episodes.ts";
import { evaluateHypothesis } from "../packages/domain/src/hypothesis/evaluators.ts";
import { validateHypothesisSpec, type HypothesisSpec } from "../packages/domain/src/hypothesis/spec.ts";

const evaluatedAt = "2026-01-31T00:00:00.000Z";
const baseSpec = (minimumSamplesPerCohort = 3): HypothesisSpec => validateHypothesisSpec({
  schemaVersion: "1", unit: "response", scope: [{ field: "activity_context", operator: "equals", value: "free_time" }],
  cohorts: [
    { key: "low_energy", conditions: [{ field: "energy", operator: "less_than_or_equal", value: 2 }] },
    { key: "high_energy", conditions: [{ field: "energy", operator: "greater_than_or_equal", value: 4 }] },
  ],
  outcome: { field: "activity_type", metric: "binary_rate_difference", positiveValues: ["passive"] },
  expectation: { relation: "cohort_a_greater_than_b", minimumEffect: 0.2 },
  evaluationPolicy: { captureModes: ["momentary_observation"], acceptedSources: ["user_confirmed", "system"], minimumSamplesPerCohort, maximumCohortRatio: 3, windowDays: 30, excludeLowCertainty: true, maximumMissingRate: 0.4 },
});

function repeated(energy: number, activity: string) { return Array.from({ length: 21 }, () => ({ energy, activity })); }

function episodes(values: Array<{ energy: number; activity: string; mode?: "momentary_observation" | "retrospective_entry"; source?: "user_confirmed" | "system" | "ai_inferred"; certainty?: "high" | "medium" | "low" }>) {
  const observations = values.flatMap<EpisodeObservation>((value, index) => {
    const context: EpisodeObservation = {
      responseId: `response-${index}`, checkinId: `checkin-${index}`, capturedAt: "2026-01-15T00:00:00.000Z", captureMode: value.mode ?? "momentary_observation", field: "activity_context", value: "free_time", source: "system", certainty: "high",
    };
    return [context, { ...context, field: "energy", value: value.energy }, { ...context, field: "activity_type", value: value.activity, source: value.source ?? "user_confirmed", certainty: value.certainty ?? "high" }];
  });
  return buildEpisodes(observations);
}

test("binary rate difference supports the expected direction", () => {
  const result = evaluateHypothesis("h1", baseSpec(), episodes([
    ...repeated(1, "passive"),
    ...repeated(4, "active"),
  ]), evaluatedAt);
  assert.equal(result.result, "supports"); assert.equal(result.observedEffect, 1); assert.ok(result.pValue !== null && result.pValue <= result.significanceAlpha); assert.equal(result.sensitivitySummary.method, "binary_rate_flip"); assert.ok(result.sensitivitySummary.minimumChangesToCrossEffect !== null);
});

test("binary rate difference challenges the expected direction", () => {
  const result = evaluateHypothesis("h1", baseSpec(), episodes([
    ...repeated(1, "active"),
    ...repeated(4, "passive"),
  ]), evaluatedAt);
  assert.equal(result.result, "challenges");
});

test("small effect is inconclusive", () => {
  const result = evaluateHypothesis("h1", baseSpec(), episodes([
    ...Array.from({ length: 11 }, () => ({ energy: 1, activity: "passive" })),
    ...Array.from({ length: 10 }, () => ({ energy: 1, activity: "active" })),
    ...Array.from({ length: 10 }, () => ({ energy: 4, activity: "passive" })),
    ...Array.from({ length: 11 }, () => ({ energy: 4, activity: "active" })),
  ]), evaluatedAt);
  assert.equal(result.result, "inconclusive");
});

test("minimum samples and cohort ratio produce insufficient_data", () => {
  const few = evaluateHypothesis("h1", baseSpec(3), episodes([{ energy: 1, activity: "passive" }, { energy: 4, activity: "active" }, { energy: 4, activity: "active" }]), evaluatedAt);
  assert.equal(few.result, "insufficient_data"); assert.ok(few.dataQualityFlags.includes("minimum_samples_per_cohort"));
  const ratio = evaluateHypothesis("h1", baseSpec(), episodes([{ energy: 1, activity: "passive" }, { energy: 1, activity: "passive" }, { energy: 1, activity: "passive" }, { energy: 1, activity: "passive" }, { energy: 1, activity: "passive" }, { energy: 1, activity: "passive" }, { energy: 1, activity: "passive" }, { energy: 1, activity: "passive" }, { energy: 4, activity: "active" }, { energy: 4, activity: "active" }]), evaluatedAt);
  assert.equal(ratio.result, "insufficient_data"); assert.ok(ratio.dataQualityFlags.includes("cohort_ratio"));
});

test("missing rate, retrospective entries, low certainty, and AI sources are excluded", () => {
  const result = evaluateHypothesis("h1", baseSpec(), episodes([
    { energy: 1, activity: "passive", mode: "retrospective_entry" }, { energy: 1, activity: "passive", certainty: "low" }, { energy: 1, activity: "passive", source: "ai_inferred" }, { energy: 1, activity: "active" },
    { energy: 4, activity: "active" }, { energy: 4, activity: "active" },
  ]), evaluatedAt);
  assert.equal(result.result, "insufficient_data");
  assert.ok(result.samples.some((sample) => sample.exclusionReason === "capture_mode_not_allowed"));
  assert.ok(result.samples.some((sample) => sample.exclusionReason === "low_certainty"));
  assert.ok(result.samples.some((sample) => sample.exclusionReason === "source_not_allowed"));
});

test("episodes classify once, ambiguous and unmatched rows are excluded", () => {
  const rows = episodes([{ energy: 1, activity: "passive" }, { energy: 4, activity: "passive" }]);
  const result = evaluateHypothesis("h1", baseSpec(), rows, evaluatedAt);
  assert.equal(result.samples.filter((sample) => sample.included).length, 2);
  const ambiguous = buildEpisodes([
    { responseId: "amb", checkinId: "c", capturedAt: "2026-01-15T00:00:00.000Z", captureMode: "momentary_observation", field: "activity_context", value: "free_time", source: "system", certainty: "high" },
    { responseId: "amb", checkinId: "c", capturedAt: "2026-01-15T00:00:00.000Z", captureMode: "momentary_observation", field: "energy", value: 3, source: "system", certainty: "high" },
  ]);
  const spec = validateHypothesisSpec({ ...baseSpec(), cohorts: [{ key: "a", conditions: [{ field: "energy", operator: "greater_than_or_equal", value: 1 }] }, { key: "b", conditions: [{ field: "energy", operator: "greater_than_or_equal", value: 1 }] }] });
  const ambiguousResult = evaluateHypothesis("h1", spec, ambiguous, evaluatedAt);
  assert.equal(ambiguousResult.samples[0].exclusionReason, "ambiguous_cohort");
});

test("numeric mean difference is deterministic and history payload can be compared", () => {
  const spec = validateHypothesisSpec({ ...baseSpec(), outcome: { field: "satisfaction", metric: "numeric_mean_difference", minimumValue: 0, maximumValue: 5 }, expectation: { relation: "cohort_a_greater_than_b", minimumEffect: 1 } });
  const input = episodes([
    ...Array.from({ length: 21 }, () => ({ energy: 1, activity: "passive" })),
    ...Array.from({ length: 21 }, () => ({ energy: 4, activity: "active" })),
  ]).flatMap((episode, index) => [
    { responseId: episode.responseId, checkinId: episode.checkinId, capturedAt: episode.capturedAt, captureMode: episode.captureMode, field: "activity_context", value: "free_time", source: "system" as const, certainty: "high" as const },
    { responseId: episode.responseId, checkinId: episode.checkinId, capturedAt: episode.capturedAt, captureMode: episode.captureMode, field: "energy", value: index < 21 ? 1 : 4, source: "system" as const, certainty: "high" as const },
    { responseId: episode.responseId, checkinId: episode.checkinId, capturedAt: episode.capturedAt, captureMode: episode.captureMode, field: "satisfaction", value: index < 21 ? 5 : 2, source: "user_confirmed" as const, certainty: "high" as const },
  ]);
  const first = evaluateHypothesis("h1", spec, buildEpisodes(input), evaluatedAt);
  const second = evaluateHypothesis("h1", spec, buildEpisodes(input), evaluatedAt);
  assert.equal(first.result, "supports"); assert.equal(first.observedEffect, 3); assert.deepEqual(first.cohortMetrics, second.cohortMetrics); assert.deepEqual(first.samples, second.samples);
});

test("invalid hypothesis specs are rejected", () => {
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), cohorts: [{ key: "same", conditions: [] }, { key: "same", conditions: [] }] }));
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), expectation: { relation: "cohort_a_greater_than_b", minimumEffect: -1 } }));
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), expectation: { relation: "cohort_a_greater_than_b", minimumEffect: 0 } }));
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), outcome: { field: "satisfaction", metric: "numeric_mean_difference" } }));
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), evaluationPolicy: { ...baseSpec().evaluationPolicy, minimumSamplesPerCohort: 2 } }));
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), evaluationPolicy: { ...baseSpec().evaluationPolicy, maximumMissingRate: 0.6 } }));
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), evaluationPolicy: { ...baseSpec().evaluationPolicy, windowDays: 366 } }));
  assert.throws(() => validateHypothesisSpec({ ...baseSpec(), evaluationPolicy: { ...baseSpec().evaluationPolicy, maximumCohortRatio: 0.5 } }));
});

test("evaluation defensively applies floors to malformed persisted settings", () => {
  const spec = baseSpec() as HypothesisSpec;
  spec.evaluationPolicy.minimumSamplesPerCohort = Number.NaN;
  spec.evaluationPolicy.maximumCohortRatio = Number.NaN;
  spec.evaluationPolicy.maximumMissingRate = Number.NaN;
  spec.evaluationPolicy.windowDays = Number.POSITIVE_INFINITY;
  spec.expectation.minimumEffect = Number.NaN;
  const result = evaluateHypothesis("h-corrupt", spec, episodes([
    { energy: 1, activity: "passive" }, { energy: 4, activity: "active" }
  ]), evaluatedAt);
  assert.equal(result.result, "insufficient_data");
});
test("source priority keeps a confirmed value over system and inferred values", () => {
  const result = buildEpisodes([
    { responseId: "priority", checkinId: "checkin", capturedAt: "2026-01-01T00:00:00.000Z", captureMode: "momentary_observation", field: "energy", value: 1, source: "user_confirmed", certainty: "high" },
    { responseId: "priority", checkinId: "checkin", capturedAt: "2026-01-02T00:00:00.000Z", captureMode: "momentary_observation", field: "energy", value: 2, source: "system", certainty: "high" },
    { responseId: "priority", checkinId: "checkin", capturedAt: "2026-01-03T00:00:00.000Z", captureMode: "momentary_observation", field: "energy", value: 3, source: "ai_inferred", certainty: "high" }
  ]);
  assert.equal(result[0]?.values.energy, 1);
  assert.equal(result[0]?.sources.energy, "user_confirmed");
});
