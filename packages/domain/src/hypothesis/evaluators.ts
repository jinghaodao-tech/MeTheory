import { matchesAll } from "./conditions.ts";
import type { ObservationEpisode } from "./episodes.ts";
import type { EvaluationResult, HypothesisSpec } from "./spec.ts";

export const HYPOTHESIS_EVALUATOR_VERSION = "comparison-v1";

export interface EvaluationSample {
  responseId: string;
  cohortKey: string | null;
  included: boolean;
  outcomeValue: unknown;
  exclusionReason: string | null;
}

export interface CohortMetric {
  cohortKey: string;
  eligibleSamples: number;
  metricValue: number | null;
  missingSamples: number;
}

export interface HypothesisEvaluation {
  hypothesisId: string;
  hypothesisSpecVersion: string;
  evaluatorVersion: string;
  evaluatedAt: string;
  windowStart: string;
  windowEnd: string;
  result: EvaluationResult;
  cohortMetrics: CohortMetric[];
  observedEffect: number | null;
  requiredEffect: number;
  dataQualityFlags: string[];
  samples: EvaluationSample[];
}

export function evaluateHypothesis(hypothesisId: string, spec: HypothesisSpec, episodes: ObservationEpisode[], evaluatedAt: string): HypothesisEvaluation {
  const windowEnd = new Date(evaluatedAt);
  const windowStart = new Date(windowEnd.getTime() - spec.evaluationPolicy.windowDays * 86400000);
  const samples: EvaluationSample[] = [];
  const cohortValues = new Map<string, unknown[]>();
  const missing = new Map<string, number>();
  for (const cohort of spec.cohorts) { cohortValues.set(cohort.key, []); missing.set(cohort.key, 0); }
  for (const episode of episodes) {
    const base = { responseId: episode.responseId, cohortKey: null, included: false, outcomeValue: episode.values[spec.outcome.field] ?? null, exclusionReason: null as string | null };
    if (!spec.evaluationPolicy.captureModes.includes(episode.captureMode)) { samples.push({ ...base, exclusionReason: "capture_mode_not_allowed" }); continue; }
    if (episode.capturedAt < windowStart.toISOString() || episode.capturedAt > windowEnd.toISOString()) { samples.push({ ...base, exclusionReason: "outside_window" }); continue; }
    if (!matchesAll(episode.values, spec.scope)) { samples.push({ ...base, exclusionReason: "scope_mismatch" }); continue; }
    if (spec.evaluationPolicy.excludeLowCertainty && episode.certainties[spec.outcome.field] === "low") { samples.push({ ...base, exclusionReason: "low_certainty" }); continue; }
    const matching = spec.cohorts.filter((cohort) => matchesAll(episode.values, cohort.conditions));
    if (matching.length !== 1) { samples.push({ ...base, exclusionReason: matching.length === 0 ? "no_cohort" : "ambiguous_cohort" }); continue; }
    const cohort = matching[0].key;
    const outcome = episode.values[spec.outcome.field];
    const missingOutcome = outcome === null || outcome === undefined || (spec.outcome.metric === "numeric_mean_difference" && typeof outcome !== "number");
    if (missingOutcome) { missing.set(cohort, missing.get(cohort)! + 1); samples.push({ ...base, cohortKey: cohort, exclusionReason: "missing_outcome" }); continue; }
    if (!spec.evaluationPolicy.acceptedSources.includes(episode.sources[spec.outcome.field])) { missing.set(cohort, missing.get(cohort)! + 1); samples.push({ ...base, cohortKey: cohort, exclusionReason: "source_not_allowed" }); continue; }
    cohortValues.get(cohort)!.push(outcome);
    samples.push({ responseId: episode.responseId, cohortKey: cohort, included: true, outcomeValue: outcome, exclusionReason: null });
  }
  const metrics = spec.cohorts.map((cohort) => {
    const values = cohortValues.get(cohort.key)!;
    const metricValue = spec.outcome.metric === "binary_rate_difference"
      ? values.filter((value) => spec.outcome.positiveValues!.some((positive) => positive === value)).length / (values.length || 1)
      : values.reduce((sum, value) => sum + (value as number), 0) / (values.length || 1);
    return { cohortKey: cohort.key, eligibleSamples: values.length, metricValue: values.length ? metricValue : null, missingSamples: missing.get(cohort.key)! };
  });
  const flags: string[] = [];
  const minSamples = spec.evaluationPolicy.minimumSamplesPerCohort;
  if (metrics.some((metric) => metric.eligibleSamples < minSamples)) flags.push("minimum_samples_per_cohort");
  const counts = metrics.map((metric) => metric.eligibleSamples);
  if (Math.min(...counts) === 0 || Math.max(...counts) / Math.min(...counts) > spec.evaluationPolicy.maximumCohortRatio) flags.push("cohort_ratio");
  const totalSamples = metrics.reduce((sum, metric) => sum + metric.eligibleSamples + metric.missingSamples, 0);
  const totalMissing = metrics.reduce((sum, metric) => sum + metric.missingSamples, 0);
  if (totalSamples === 0 || totalMissing / totalSamples > spec.evaluationPolicy.maximumMissingRate) flags.push("maximum_missing_rate");
  const observedEffect = metrics[0].metricValue === null || metrics[1].metricValue === null ? null : metrics[0].metricValue - metrics[1].metricValue;
  let result: EvaluationResult = "insufficient_data";
  if (flags.length === 0 && observedEffect !== null) {
    const direction = spec.expectation.relation === "cohort_a_greater_than_b" ? observedEffect : -observedEffect;
    result = direction >= spec.expectation.minimumEffect ? "supports" : direction <= -spec.expectation.minimumEffect ? "challenges" : "inconclusive";
  }
  return { hypothesisId, hypothesisSpecVersion: spec.schemaVersion, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION, evaluatedAt, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), result, cohortMetrics: metrics, observedEffect, requiredEffect: spec.expectation.minimumEffect, dataQualityFlags: flags, samples };
}
