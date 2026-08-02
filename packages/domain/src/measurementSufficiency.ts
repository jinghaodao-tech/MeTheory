export type MeasurementSufficiencyStatus = "template_required" | "waiting_for_template_review" | "ready_to_record" | "collecting" | "insufficient_group_balance" | "ready_for_analysis" | "analysis_completed";
export type SufficiencyRequirement = { semanticRole: string; required?: boolean; minimumSamples?: number; analysisUsage?: "condition" | "outcome" | "both" };
export type SufficiencySnapshot = { records?: Array<{ id: string; recordedAt?: string; groupKey?: string; values?: Array<{ analysisRole?: string; analysisUsage?: string; analysisRoleConfirmed?: boolean; value?: unknown; minimum?: number; maximum?: number; provenance?: { userConfirmed?: boolean } }> }> };

export function assessMeasurementSufficiency(input: { requestStatus?: string; requirements: SufficiencyRequirement[]; snapshot?: SufficiencySnapshot; startAt?: string; endAt?: string; minimumObservations?: number; minimumPerGroup?: number; analysisCompleted?: boolean }) {
  if (!input.requestStatus || input.requestStatus === "draft" || input.requestStatus === "rejected") return { status: "template_required" as const, minimumObservations: input.minimumObservations ?? 0, usableObservations: 0, minimumPerRequirement: {}, countsByRequirement: {}, groupCounts: {}, missingRequirements: input.requirements.map((item) => item.semanticRole), reasonCodes: ["template_not_activated"], excluded: { outOfPeriod: 0, unconfirmed: 0, invalid: 0 } };
  if (!["approved", "activated"].includes(input.requestStatus)) return { status: "waiting_for_template_review" as const, minimumObservations: input.minimumObservations ?? 0, usableObservations: 0, minimumPerRequirement: Object.fromEntries(input.requirements.map((item) => [item.semanticRole, item.minimumSamples ?? 1])), countsByRequirement: {}, groupCounts: {}, missingRequirements: input.requirements.map((item) => item.semanticRole), reasonCodes: ["template_review_pending"], excluded: { outOfPeriod: 0, unconfirmed: 0, invalid: 0 } };
  const records = input.snapshot?.records ?? [];
  const counts: Record<string, number> = {};
  const groupCounts: Record<string, number> = {};
  for (const requirement of input.requirements) counts[requirement.semanticRole] = 0;
  let outOfPeriod = 0, unconfirmed = 0, invalid = 0;
  const start = input.startAt ? Date.parse(input.startAt) : -Infinity;
  const end = input.endAt ? Date.parse(input.endAt) : Infinity;
  for (const record of records) {
    const recorded = Date.parse(String(record.recordedAt ?? ""));
    if (!Number.isFinite(recorded) || recorded < start || recorded > end) { outOfPeriod += 1; continue; }
    const condition = input.requirements.find((requirement) => requirement.analysisUsage === "condition" || requirement.analysisUsage === "both");
    const conditionValue = condition ? (record.values ?? []).find((item) => item.analysisRole === condition.semanticRole && (item.analysisUsage === condition.analysisUsage || item.analysisUsage === "both" || condition.analysisUsage === "both")) : undefined;
    const derivedGroupKey = record.groupKey ?? (conditionValue?.value === undefined || conditionValue?.value === null ? undefined : `${condition?.semanticRole}:${String(conditionValue.value)}`);
    for (const requirement of input.requirements) {
      const value = (record.values ?? []).find((item) => item.analysisRole === requirement.semanticRole && (item.analysisUsage === requirement.analysisUsage || item.analysisUsage === "both" || requirement.analysisUsage === "both"));
      if (!value) continue;
      if (value.analysisRoleConfirmed !== true || value.provenance?.userConfirmed !== true) { unconfirmed += 1; continue; }
      if (value.value === null || value.value === undefined || (typeof value.value === "number" && ((!Number.isFinite(value.value)) || (value.minimum !== undefined && value.value < value.minimum) || (value.maximum !== undefined && value.value > value.maximum)))) { invalid += 1; continue; }
      counts[requirement.semanticRole] += 1;
      if (derivedGroupKey && (requirement.analysisUsage === "condition" || requirement.analysisUsage === "both")) groupCounts[derivedGroupKey] = (groupCounts[derivedGroupKey] ?? 0) + 1;
    }
  }
  const minimums = Object.fromEntries(input.requirements.map((item) => [item.semanticRole, item.minimumSamples ?? 1]));
  const missing = input.requirements.filter((item) => counts[item.semanticRole] < (item.minimumSamples ?? 1)).map((item) => item.semanticRole);
  const usableObservations = input.requirements.length ? Math.min(...input.requirements.map((item) => counts[item.semanticRole])) : 0;
  const minimumObservations = input.minimumObservations ?? Math.max(1, input.requirements.length ? Math.max(...Object.values(minimums)) : 0);
  const groupMinimum = input.minimumPerGroup ?? 0;
  const groupBalanceInsufficient = groupMinimum > 0 && Object.keys(groupCounts).length >= 2 && Object.values(groupCounts).some((count) => count < groupMinimum);
  const status: MeasurementSufficiencyStatus = input.analysisCompleted ? "analysis_completed" : groupBalanceInsufficient ? "insufficient_group_balance" : missing.length === 0 && usableObservations >= minimumObservations ? "ready_for_analysis" : records.length ? "collecting" : "ready_to_record";
  const reasonCodes = [...missing.map((role) => `missing_requirement:${role}`), ...(groupBalanceInsufficient ? ["minimum_per_group_not_met"] : []), ...(outOfPeriod ? ["out_of_period_values_excluded"] : []), ...(unconfirmed ? ["unconfirmed_values_excluded"] : []), ...(invalid ? ["invalid_or_out_of_range_values_excluded"] : [])];
  return { status, minimumObservations, usableObservations, minimumPerRequirement: minimums, countsByRequirement: counts, groupCounts, missingRequirements: missing, reasonCodes, excluded: { outOfPeriod, unconfirmed, invalid } };
}
