import { EVIDENCE_POLICY } from "./evidencePolicy.ts";

export type MeasurementSufficiencyStatus = "template_required" | "waiting_for_template_review" | "ready_to_record" | "collecting" | "insufficient_paired_observations" | "insufficient_group_count" | "insufficient_group_balance" | "ready_for_analysis" | "analysis_completed";
export type SufficiencyRequirement = { semanticRole: string; required?: boolean; minimumSamples?: number; analysisUsage?: "condition" | "outcome" | "both" };
export type SufficiencySnapshot = { records?: Array<{ id: string; recordedAt?: string; groupKey?: string; values?: Array<{ analysisRole?: string; analysisUsage?: string; analysisRoleConfirmed?: boolean; value?: unknown; minimum?: number; maximum?: number; provenance?: { userConfirmed?: boolean } }> }> };

export function assessMeasurementSufficiency(input: { requestStatus?: string; requirements: SufficiencyRequirement[]; snapshot?: SufficiencySnapshot; startAt?: string; endAt?: string; minimumObservations?: number; minimumPerGroup?: number; analysisCompleted?: boolean }) {
  const minimumObservations = Math.max(EVIDENCE_POLICY.minimumTotalSamples, Number.isInteger(input.minimumObservations) ? input.minimumObservations! : 0);
  const minimums = Object.fromEntries(input.requirements.map((item) => [item.semanticRole, Math.max(EVIDENCE_POLICY.minimumSamplesPerCohort, Number.isInteger(item.minimumSamples) ? item.minimumSamples! : 0)]));
  const empty = { minimumObservations, usableObservations: 0, minimumPerRequirement: minimums, countsByRequirement: Object.fromEntries(input.requirements.map((item) => [item.semanticRole, 0])), groupCounts: {}, missingRequirements: input.requirements.map((item) => item.semanticRole), reasonCodes: ["template_not_activated"], excluded: { outOfPeriod: 0, unconfirmed: 0, invalid: 0 } };
  if (!input.requestStatus || input.requestStatus === "draft" || input.requestStatus === "rejected") return { status: "template_required" as const, ...empty };
  if (!input.requestStatus || !["approved", "activated"].includes(input.requestStatus)) return { status: "waiting_for_template_review" as const, ...empty, reasonCodes: ["template_review_pending"] };
  const records = input.snapshot?.records ?? [];
  const counts: Record<string, number> = Object.fromEntries(input.requirements.map((item) => [item.semanticRole, 0]));
  const groupCounts: Record<string, number> = {};
  let outOfPeriod = 0, unconfirmed = 0, invalid = 0, paired = 0;
  const start = input.startAt ? Date.parse(input.startAt) : -Infinity;
  const end = input.endAt ? Date.parse(input.endAt) : Infinity;
  const usableValue = (value: any) => value && value.analysisRoleConfirmed === true && value.provenance?.userConfirmed === true && value.value !== null && value.value !== undefined && !(typeof value.value === "number" && (!Number.isFinite(value.value) || (value.minimum !== undefined && value.value < value.minimum) || (value.maximum !== undefined && value.value > value.maximum)));
  for (const record of records) {
    const recorded = Date.parse(String(record.recordedAt ?? ""));
    if (!Number.isFinite(recorded) || recorded < start || recorded > end) { outOfPeriod += 1; continue; }
    const usable = new Map<string, any>();
    for (const requirement of input.requirements) {
      const value = (record.values ?? []).find((item) => item.analysisRole === requirement.semanticRole && (item.analysisUsage === requirement.analysisUsage || item.analysisUsage === "both" || requirement.analysisUsage === "both"));
      if (!value) continue;
      if (value.analysisRoleConfirmed !== true || value.provenance?.userConfirmed !== true) { unconfirmed += 1; continue; }
      if (!usableValue(value)) { invalid += 1; continue; }
      usable.set(requirement.semanticRole, value);
    }
    const required = input.requirements.filter((item) => item.required !== false);
    const isPaired = required.every((item) => usable.has(item.semanticRole));
    if (!isPaired) continue;
    paired += 1;
    for (const requirement of input.requirements) if (usable.has(requirement.semanticRole)) counts[requirement.semanticRole] += 1;
    const condition = input.requirements.find((item) => item.analysisUsage === "condition" || item.analysisUsage === "both");
    const conditionValue = condition ? usable.get(condition.semanticRole)?.value : undefined;
    const groupKey = record.groupKey ?? (conditionValue === undefined ? undefined : `${condition?.semanticRole}:${String(conditionValue)}`);
    if (groupKey) groupCounts[groupKey] = (groupCounts[groupKey] ?? 0) + 1;
  }
  const missing = input.requirements.filter((item) => counts[item.semanticRole] < minimums[item.semanticRole]).map((item) => item.semanticRole);
  const groupMinimum = Math.max(EVIDENCE_POLICY.minimumSamplesPerCohort, Number.isInteger(input.minimumPerGroup) ? input.minimumPerGroup! : 0);
  const groups = Object.values(groupCounts);
  const groupCountInsufficient = groups.length < 2;
  const groupBalanceInsufficient = !groupCountInsufficient && groupMinimum > 0 && groups.some((count) => count < groupMinimum);
  const reasonCodes = [
    ...missing.map((role) => `missing_required_value:${role}`),
    ...(paired < minimumObservations ? ["minimum_paired_observations_not_met"] : []),
    ...(groupCountInsufficient ? ["minimum_group_count_not_met"] : []),
    ...(groupBalanceInsufficient ? ["minimum_per_group_not_met"] : []),
    ...(outOfPeriod ? ["out_of_period_excluded"] : []),
    ...(unconfirmed ? ["unconfirmed_value_excluded"] : []),
    ...(invalid ? ["invalid_value_excluded"] : [])
  ];
  const status: MeasurementSufficiencyStatus = input.analysisCompleted ? "analysis_completed" : paired === 0 ? "ready_to_record" : missing.length ? "collecting" : paired < minimumObservations ? "insufficient_paired_observations" : groupCountInsufficient ? "insufficient_group_count" : groupBalanceInsufficient ? "insufficient_group_balance" : "ready_for_analysis";
  return { status, minimumObservations, usableObservations: paired, minimumPerRequirement: minimums, countsByRequirement: counts, groupCounts, missingRequirements: missing, reasonCodes, excluded: { outOfPeriod, unconfirmed, invalid } };
}
