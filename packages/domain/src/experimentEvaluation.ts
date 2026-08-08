import { EVIDENCE_POLICY, normalizedNumericEffect, validNumericScale } from "./evidencePolicy.ts";
import type { ExperimentEvaluation, ExperimentKind, ExperimentObservation } from "./experiments.ts";

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function evaluateExperimentDeterministic(input: {
  experimentId: string;
  observations: ExperimentObservation[];
  groupAKey: string;
  groupBKey: string;
  minimumPerGroup: number;
  minimumObservations: number;
  expectedDirection: "a_greater" | "b_greater";
  minimumEffect: number;
  kind?: ExperimentKind;
  evaluatedAt?: string;
  alternativeExplanations?: string[];
  outcomeScale?: { minimumValue: number; maximumValue: number };
}): ExperimentEvaluation {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const minimumPerGroup = Math.max(EVIDENCE_POLICY.minimumSamplesPerCohort, Number.isInteger(input.minimumPerGroup) ? input.minimumPerGroup : 0);
  const minimumObservations = Math.max(EVIDENCE_POLICY.minimumTotalSamples, minimumPerGroup * 2, Number.isInteger(input.minimumObservations) ? input.minimumObservations : 0);
  const configuredEffect = Number.isFinite(input.minimumEffect) ? Math.abs(input.minimumEffect) : 0;
  const scale = validNumericScale(input.outcomeScale) ? input.outcomeScale : undefined;
  const minimumEffect = scale ? Math.max(EVIDENCE_POLICY.minimumAbsoluteEffect * (scale.maximumValue - scale.minimumValue), configuredEffect) : Math.max(EVIDENCE_POLICY.minimumAbsoluteEffect, configuredEffect);
  const eligible = input.observations.filter((observation) => observation.eligible && Number.isFinite(observation.outcome));
  const excludedCount = input.observations.length - eligible.length;
  const groupA = eligible.filter((observation) => observation.groupKey === input.groupAKey);
  const groupB = eligible.filter((observation) => observation.groupKey === input.groupBKey);
  const meanA = mean(groupA.map((observation) => observation.outcome));
  const meanB = mean(groupB.map((observation) => observation.outcome));
  const difference = groupA.length && groupB.length ? meanA - meanB : null;
  const direction = difference === null ? "unknown" : difference === 0 ? "equal" : difference > 0 ? "a_greater" : "b_greater";
  const groupImbalance = Math.min(groupA.length, groupB.length) / Math.max(groupA.length, groupB.length, 1);
  const exclusionRate = input.observations.length ? excludedCount / input.observations.length : 1;
  const warnings: string[] = [];
  if (groupImbalance < EVIDENCE_POLICY.minimumSampleBalance) warnings.push("グループ間の記録数に偏りがあります");
  if (excludedCount > 0) warnings.push("一部の観測は評価条件を満たさないため除外されました");
  if (!scale) warnings.push("数値の範囲が未設定のため、効果量は絶対値で判定されます");
  const missingData: Array<{ groupKey: string; needed: number; reason: string }> = [];
  if (groupA.length < minimumPerGroup) missingData.push({ groupKey: input.groupAKey, needed: minimumPerGroup - groupA.length, reason: "group_a_samples_insufficient" });
  if (groupB.length < minimumPerGroup) missingData.push({ groupKey: input.groupBKey, needed: minimumPerGroup - groupB.length, reason: "group_b_samples_insufficient" });
  const expectedDirectionValid = input.expectedDirection === "a_greater" || input.expectedDirection === "b_greater";
  const qualityInsufficient = !groupA.length || !groupB.length || eligible.length < minimumObservations || groupA.length < minimumPerGroup || groupB.length < minimumPerGroup || groupImbalance < EVIDENCE_POLICY.minimumSampleBalance || exclusionRate > EVIDENCE_POLICY.maximumMissingRate;
  let status: ExperimentEvaluation["status"] = !expectedDirectionValid ? "invalid" : qualityInsufficient ? "insufficient_data" : "inconclusive";
  let adherence: ExperimentEvaluation["adherence"];
  if (input.kind === "behavioral_intervention") {
    const attempted = eligible.filter((observation) => observation.conditionValues?.interventionAttempted !== undefined);
    const completed = attempted.filter((observation) => observation.conditionValues?.interventionAttempted === true);
    const rate = attempted.length ? completed.length / attempted.length : 0;
    adherence = { attempted: attempted.length, completed: completed.length, rate, notImplementedCount: 0, reasons: rate < EVIDENCE_POLICY.minimumInterventionAdherence ? ["intervention_adherence_below_floor"] : [] };
    if (!qualityInsufficient && (attempted.length < minimumObservations || rate < EVIDENCE_POLICY.minimumInterventionAdherence)) status = "insufficient_data";
  }
  if (status !== "insufficient_data" && status !== "invalid" && difference !== null) {
    const signedDifference = input.expectedDirection === "a_greater" ? difference : -difference;
    const effectEnough = scale
      ? (normalizedNumericEffect(signedDifference, scale) ?? 0) >= EVIDENCE_POLICY.minimumAbsoluteEffect && Math.abs(signedDifference) >= minimumEffect
      : Math.abs(signedDifference) >= minimumEffect;
    const directionMatches = input.expectedDirection === "a_greater" ? difference > 0 : difference < 0;
    status = effectEnough ? (directionMatches ? "supported" : "challenged") : "inconclusive";
  }
  const supportIds = status === "supported" ? eligible.map((observation) => observation.id) : [];
  const contradictionIds = status === "challenged" ? eligible.map((observation) => observation.id) : [];
  const additional = Math.max(0, minimumPerGroup - Math.min(groupA.length, groupB.length));
  const sensitivity = {
    conclusionChangeConditions: status === "supported" ? [`各グループに${Math.max(1, additional)}件以上の観測が追加され、平均差が${minimumEffect}未満になる場合`] : ["グループの記録数または評価条件が変わる場合"],
    groupImbalanceWarnings: groupImbalance < EVIDENCE_POLICY.minimumSampleBalance ? ["グループ間の記録数の差が大きいため、結論は安定していません"] : [],
    missingnessWarnings: excludedCount ? ["除外された観測によって結果が変わる可能性があります"] : [],
    overlapWarnings: [],
    minimumAdditionalObservations: additional || undefined,
    explanation: status === "insufficient_data" ? "必要な記録数またはデータ品質の条件を満たしていないため、結論を出せません" : "現在の記録範囲と判定条件に基づく決定論的な評価です"
  };
  return {
    experimentId: input.experimentId,
    status,
    period: { startAt: input.observations[0]?.observedAt ?? evaluatedAt, endAt: input.observations.at(-1)?.observedAt ?? evaluatedAt },
    observationCount: eligible.length,
    groupCounts: [{ key: input.groupAKey, count: groupA.length, mean: meanA }, { key: input.groupBKey, count: groupB.length, mean: meanB }],
    effectSummary: { groupA: input.groupAKey, groupB: input.groupBKey, difference, direction },
    dataQuality: { eligibleCount: eligible.length, excludedCount, missingCount: input.observations.filter((observation) => !observation.eligible).length, groupImbalance, warnings },
    supportingObservationIds: supportIds,
    contradictingObservationIds: contradictionIds,
    missingData,
    ...(adherence ? { adherence } : {}),
    alternativeExplanations: input.alternativeExplanations ?? ["記録されていない条件や別の要因が結果に影響している可能性があります"],
    sensitivitySummary: sensitivity,
    nextOptions: status === "insufficient_data" ? ["collect_more", "pause_and_reduce_burden"] : status === "supported" || status === "challenged" ? ["review_hypothesis", "repeat_in_another_period", "archive_experiment"] : ["collect_more", "repeat_in_another_period"],
    evaluatedAt
  };
}
