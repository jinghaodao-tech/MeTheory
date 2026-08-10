import { matchesAll } from "./conditions.ts";
import type { ObservationEpisode } from "./episodes.ts";
import type { EvaluationResult, HypothesisSpec } from "./spec.ts";
import { EVIDENCE_POLICY, effectiveConclusionMinimumEffect } from "../evidencePolicy.ts";
import { correctedAlpha, exactPermutationPValue, type SignificanceMethod } from "../significance.ts";
import { binaryRateSensitivity, type SensitivitySummary } from "../sensitivity.ts";

export const HYPOTHESIS_EVALUATOR_VERSION = "comparison-v3";

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
  pValue: number | null;
  significanceAlpha: number;
  significanceMethod: SignificanceMethod | "not_evaluable";
  sensitivitySummary: SensitivitySummary;
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
  const numericScale = spec.outcome.metric === "numeric_mean_difference" ? { minimumValue: Number(spec.outcome.minimumValue), maximumValue: Number(spec.outcome.maximumValue) } : undefined;
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
  const numericValues = spec.cohorts.map((cohort) => cohortValues.get(cohort.key)!.flatMap((value) => spec.outcome.metric === "binary_rate_difference" ? [spec.outcome.positiveValues!.some((positive) => positive === value) ? 1 : 0] : typeof value === "number" ? [value] : []));
  const observedEffect = metrics[0].metricValue === null || metrics[1].metricValue === null ? null : metrics[0].metricValue - metrics[1].metricValue;
  const observedDirection = observedEffect !== null && observedEffect < 0 ? "b_greater" : "a_greater";
  const significance = exactPermutationPValue(numericValues[0], numericValues[1], observedDirection);
  const significanceAlpha = correctedAlpha(spec.evaluationPolicy.comparisonCount ?? 1);
  if (!significance) flags.push("significance_not_evaluable");
  const requiredEffect = effectiveConclusionMinimumEffect(spec.outcome.metric, spec.expectation.minimumEffect, numericScale);
  const conclusionSampleFloorMet = metrics.every((metric) => metric.eligibleSamples >= EVIDENCE_POLICY.minimumConclusionSamplesPerCohort);
  if (!conclusionSampleFloorMet) flags.push("conclusion_sample_floor");
  const binarySensitivity = spec.outcome.metric === "binary_rate_difference"
    ? binaryRateSensitivity({
      groupAPositive: numericValues[0].reduce((sum, value) => sum + value, 0),
      groupATotal: numericValues[0].length,
      groupBPositive: numericValues[1].reduce((sum, value) => sum + value, 0),
      groupBTotal: numericValues[1].length,
      minimumEffect: requiredEffect
    })
    : null;
  const minimumAdditionalObservations = metrics.reduce(
    (sum, metric) => sum + Math.max(0, EVIDENCE_POLICY.minimumConclusionSamplesPerCohort - metric.eligibleSamples),
    0
  );
  const sensitivitySummary: SensitivitySummary = {
    conclusionChangeConditions: binarySensitivity?.minimumChangesToCrossEffect !== null && binarySensitivity?.minimumChangesToCrossEffect !== undefined
      ? [`${binarySensitivity.minimumChangesToCrossEffect} binary observation changes would move the effect below the configured floor`]
      : ["Additional observations, missingness, or scale changes may alter the conclusion"],
    groupImbalanceWarnings: counts.length === 2 && Math.min(...counts) / Math.max(...counts, 1) < 0.5
      ? ["Cohort sizes are materially imbalanced"]
      : [],
    missingnessWarnings: totalMissing > 0 ? ["Some observations were excluded or missing"] : [],
    overlapWarnings: [],
    minimumAdditionalObservations: minimumAdditionalObservations || undefined,
    minimumChangesToCrossEffect: binarySensitivity?.minimumChangesToCrossEffect ?? null,
    changesByGroup: binarySensitivity?.changesByGroup,
    method: binarySensitivity ? "binary_rate_flip" : "not_applicable",
    explanation: "Sensitivity describes how close this comparison is to changing its conclusion; it is not a diagnosis or causal guarantee."
  };
  let result: EvaluationResult = "insufficient_data";
  const blockingFlags = flags.filter((flag) => flag !== "conclusion_sample_floor");
  if (blockingFlags.length === 0 && conclusionSampleFloorMet && observedEffect !== null) {
    const direction = spec.expectation.relation === "cohort_a_greater_than_b" ? observedEffect : -observedEffect;
    const significant = significance !== null && significance.pValue <= significanceAlpha + 1e-12;
    result = significant && direction >= requiredEffect ? "supports" : significant && direction <= -requiredEffect ? "challenges" : "inconclusive";
  }
  return { hypothesisId, hypothesisSpecVersion: spec.schemaVersion, evaluatorVersion: HYPOTHESIS_EVALUATOR_VERSION, evaluatedAt, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), result, cohortMetrics: metrics, observedEffect, requiredEffect, dataQualityFlags: flags, samples, pValue: significance?.pValue ?? null, significanceAlpha, significanceMethod: significance?.method ?? "not_evaluable", sensitivitySummary };
}
