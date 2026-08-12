import type { PcsAnalysisResult } from "../../../packages/self-understanding/src/pcsSnapshotAnalysis.ts";

type ApiPcsAnalysisResult = PcsAnalysisResult & { analysisRunId?: string };

export type SafePcsAnalysisSummary = {
  status: PcsAnalysisResult["status"];
  snapshotId: string;
  profileId: string;
  analysisRunId?: string;
  period: PcsAnalysisResult["period"];
  dataQuality: PcsAnalysisResult["dataQuality"];
  practicalThresholds?: PcsAnalysisResult["practicalThresholds"];
  candidateAudit?: PcsAnalysisResult["candidateAudit"];
  robustness?: PcsAnalysisResult["robustness"];
  excludedFields: Array<{ templateId: string; templateVersionId: string; fieldKey: string; reason: string }>;
  hypotheses: Array<{
    id: string;
    statement: string;
    construct: string;
    tendencyScope: string;
    status: string;
    displayPriority: number;
    supportingPatternDayCount: number;
    contradictingPatternDayCount: number;
    dataShortage: string[];
    alternativeExplanations?: string[];
    sensitivitySummary?: PcsAnalysisResult["hypotheses"][number]["sensitivitySummary"];
  }>;
};

export function summarizePcsAnalysis(value: ApiPcsAnalysisResult): SafePcsAnalysisSummary {
  return {
    status: value.status,
    snapshotId: value.snapshotId,
    profileId: value.profileId,
    ...(value.analysisRunId ? { analysisRunId: value.analysisRunId } : {}),
    period: value.period,
    dataQuality: value.dataQuality,
    practicalThresholds: value.practicalThresholds,
    candidateAudit: value.candidateAudit,
    robustness: value.robustness,
    excludedFields: value.excludedFields.map((field) => ({
      templateId: field.templateId,
      templateVersionId: field.templateVersionId,
      fieldKey: field.fieldKey,
      reason: field.reason
    })),
    hypotheses: value.hypotheses.map((hypothesis) => ({
      id: hypothesis.id,
      statement: hypothesis.statement,
      construct: hypothesis.construct,
      tendencyScope: hypothesis.tendencyScope,
      status: hypothesis.status,
      displayPriority: hypothesis.displayPriority,
      supportingPatternDayCount: hypothesis.supportingEvidence.length,
      contradictingPatternDayCount: hypothesis.contradictingEvidence.length,
      dataShortage: hypothesis.dataShortage,
      alternativeExplanations: hypothesis.alternativeExplanations,
      sensitivitySummary: hypothesis.sensitivitySummary
    }))
  };
}

export function formatPcsAnalysis(summary: SafePcsAnalysisSummary): string {
  const lines = [
    "PCS analysis",
    `period: ${summary.period.startAt} - ${summary.period.endAt}`,
    `status: ${summary.status}`,
    `records: ${summary.dataQuality.recordCount}`,
    `usable values: ${summary.dataQuality.usableValueCount}`,
    `excluded fields: ${summary.dataQuality.excludedFieldCount}`,
    `excluded values: ${summary.dataQuality.excludedValueCount}`
  ];
  const coverage = summary.dataQuality.coverage;
  if (coverage) lines.push(`record coverage: ${coverage.observedRecordDays}/${coverage.calendarSpanDays} days; missing ${coverage.missingRecordDays}`);
  if (summary.practicalThresholds?.length) lines.push(`practical thresholds: ${summary.practicalThresholds.map((item) => `${item.fieldKey} >= ${item.minimumDifference}${item.unit ? ` ${item.unit}` : ""}`).join(", ")}`);
  if ((summary.candidateAudit?.suppressedByDisplayLimit ?? 0) > 0) lines.push(`suppressed by display limit: ${summary.candidateAudit?.suppressedByDisplayLimit}`);
  if (!summary.hypotheses.length) {
    lines.push("hypotheses: none");
    lines.push(summary.dataQuality.recordCount === 0 ? "reason: no records in the selected period" : "reason: verify confirmed values, roles, and sample size");
    return lines.join("\n");
  }
  lines.push(`hypotheses: ${summary.hypotheses.length}`);
  for (const [index, hypothesis] of summary.hypotheses.entries()) {
    lines.push(`${index + 1}. ${hypothesis.statement}`);
    lines.push(`   status: ${hypothesis.status} / display priority: ${hypothesis.displayPriority.toFixed(2)}`);
    lines.push(`   pattern-aligned days: ${hypothesis.supportingPatternDayCount} / pattern-divergent days: ${hypothesis.contradictingPatternDayCount}`);
    if (hypothesis.sensitivitySummary) lines.push(`   sensitivity: ${hypothesis.sensitivitySummary.method} / minimum changes: ${hypothesis.sensitivitySummary.minimumChangesToCrossEffect ?? "unknown"}`);
    if (hypothesis.alternativeExplanations?.length) lines.push(`   alternatives: ${hypothesis.alternativeExplanations.join(", ")}`);
  }
  return lines.join("\n");
}
