export const EVIDENCE_POLICY = Object.freeze({
  minimumSamplesPerCohort: 3,
  minimumTotalSamples: 6,
  minimumAbsoluteEffect: 0.1,
  minimumDirectionalObservations: 3,
  minimumDirectionalLead: 2,
  minimumSampleBalance: 0.25,
  maximumCohortRatio: 4,
  maximumMissingRate: 0.5,
  maximumWindowDays: 365,
  minimumReplicationPeriods: 2,
  minimumNormalizedReplicationEffect: 0.1,
  minimumTemporalSamplesPerCohort: 3,
  minimumTemporalNormalizedEffect: 0.1,
  minimumInterventionAdherence: 0.5,
});

export type NumericScale = { minimumValue: number; maximumValue: number };

export function validNumericScale(scale: NumericScale | undefined): scale is NumericScale {
  return Boolean(
    scale &&
    Number.isFinite(scale.minimumValue) &&
    Number.isFinite(scale.maximumValue) &&
    scale.maximumValue > scale.minimumValue
  );
}

export function normalizedNumericEffect(effect: number, scale: NumericScale | undefined): number | null {
  if (!validNumericScale(scale) || !Number.isFinite(effect)) return null;
  return Math.abs(effect) / (scale.maximumValue - scale.minimumValue);
}

export function effectiveMinimumEffect(metric: "binary_rate_difference" | "numeric_mean_difference", configured: number, scale?: NumericScale): number {
  const finite = Number.isFinite(configured) ? configured : 0;
  const minimum = Math.max(EVIDENCE_POLICY.minimumAbsoluteEffect, finite);
  if (metric === "binary_rate_difference") return Math.min(1, minimum);
  return validNumericScale(scale)
    ? Math.max(minimum, EVIDENCE_POLICY.minimumAbsoluteEffect * (scale.maximumValue - scale.minimumValue))
    : minimum;
}
