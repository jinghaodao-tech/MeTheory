import { matchesAll } from "./conditions.ts";
import type { ObservationEpisode } from "./episodes.ts";
import type { EvaluationResult, HypothesisSpec } from "./spec.ts";
import { EVIDENCE_POLICY, effectiveMinimumEffect } from "../evidencePolicy.ts";

export const HYPOTHESIS_EVALUATOR_VERSION = "comparison-v2";

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
  const windowDays = Math.max(1, Math.min(EVIDENCE_POLICY.maximumWindowDays, Number.isFinite(spec.evaluationPolicy.windowDays) ? Math.floor(spec.evaluationPolicy.windowDays) : EVIDENCE_POLICY.maximumWindowDays));
  const windowStart = new Date(windowEnd.getTime() - windowDays * 86400000);
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
      : values.reduce<number>((sum, value) => sum + (value as number), 0) / (values.length || 1);
    return { cohortKey: cohort.key, eligibleSamples: values.length, metricValue: values.length ? metricValue : null, missingSamples: missing.get(cohort.key)! };
  });
  const flags: string[] = [];
  const numericScale = spec.outcome.metric === "numeric_mean_difference"
    ? { minimumValue: Number(spec.outcome.minimumValue), maximumValue: Number(spec.outcome.maximumValue) }
    : undefined;
  if (spec.outcome.metric === "numeric_mean_difference" && (!Number.isFinite(numericScale?.minimumValue) || !Number.isFinite(numericScale?.maximumValue) || numericScale!.maximumValue <= numericScale!.minimumValue)) flags.push("numeric_scale_missing");
  const minSamples = Math.max(EVIDENCE_POLICY.minimumSamplesPerCohort, Number.isFinite(spec.evaluationPolicy.minimumSamplesPerCohort) ? Math.floor(spec.evaluationPolicy.minimumSamplesPerCohort) : EVIDENCE_POLICY.minimumSamplesPerCohort);
  if (metrics.some((metric) => metric.eligibleSamples < minSamples)) flags.push("minimum_samples_per_cohort");
  const counts = metrics.map((metric) => metric.eligibleSamples);
  const maximumCohortRatio = Math.max(1, Math.min(EVIDENCE_POLICY.maximumCohortRatio, Number.isFinite(spec.evaluationPolicy.maximumCohortRatio) ? spec.evaluationPolicy.maximumCohortRatio : EVIDENCE_POLICY.maximumCohortRatio));
  if (Math.min(...counts) === 0 || Math.max(...counts) / Math.min(...counts) > maximumCohortRatio) flags.push("cohort_ratio");
  const evaluatedSamples = samples.filter((sample) => sample.exclusionReason !== "outside_window");
  const totalSamples = evaluatedSamples.length;
  const totalMissing = evaluatedSamples.filter((sample) => !sample.included).length;
  if (totalSamples < EVIDENCE_POLICY.minimumTotalSamples) flags.push("minimum_total_samples");
  const maximumMissingRate = Math.max(0, Math.min(EVIDENCE_POLICY.maximumMissingRate, Number.isFinite(spec.evaluationPolicy.maximumMissingRate) ? spec.evaluationPolicy.maximumMissingRate : EVIDENCE_POLICY.maximumMissingRate));
  if (totalSamples === 0 || totalMissing / totalSamples > maximumMissingRate) flags.push("maximum_missing_rate");
  const observedEffect = metrics[0].metricValue === null || metrics[1].metricValue === null ? null : metrics[0].metricValue - metrics[1].metricValue;
  let result: EvaluationResult = "insufficient_data";
  const requiredEffect = effectiveMinimumEffect(spec.outcome.metric, spec.expectation.minimumEffect, numericScale);
  if (flags.length === 0 && observedEffect !== null) {
    const direction = spec.expectation.relation === "cohort_a_greater_than_b" ? observedEffect : -observedEffect;
    result = direction >= requiredEffect ? "supports" : direction <= -requiredEffect ? "challenges" : "inconclusive";
  }
  return { hypothesisId, hypothesisSpecVersion: spec.schemaVersion, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION, evaluatedAt, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), result, cohortMetrics: metrics, observedEffect, requiredEffect, dataQualityFlags: flags, samples };
}
