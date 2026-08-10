import type { PcsAnalysisResult } from "../../../packages/self-understanding/src/pcsSnapshotAnalysis.ts";

type ApiPcsAnalysisResult = PcsAnalysisResult & { analysisRunId?: string };

export type SafePcsAnalysisSummary = {
  status: PcsAnalysisResult["status"];
  snapshotId: string;
  profileId: string;
  analysisRunId?: string;
  period: PcsAnalysisResult["period"];
  dataQuality: PcsAnalysisResult["dataQuality"];
  candidateAudit?: PcsAnalysisResult["candidateAudit"];
  excludedFields: Array<{ templateId: string; templateVersionId: string; fieldKey: string; reason: string }>;
  hypotheses: Array<{
    id: string;
    statement: string;
    construct: string;
    tendencyScope: string;
    status: string;
    confidence: number;
    supportingEvidenceCount: number;
    contradictingEvidenceCount: number;
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
    candidateAudit: value.candidateAudit,
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
      confidence: hypothesis.confidence,
      supportingEvidenceCount: hypothesis.supportingEvidence.length,
      contradictingEvidenceCount: hypothesis.contradictingEvidence.length,
      dataShortage: hypothesis.dataShortage,
      alternativeExplanations: hypothesis.alternativeExplanations,
      sensitivitySummary: hypothesis.sensitivitySummary
    }))
  };
}

export function formatPcsAnalysis(summary: SafePcsAnalysisSummary): string {
  const lines = [
    "PCS実データ分析",
    `期間: ${summary.period.startAt} ～ ${summary.period.endAt}`,
    `状態: ${summary.status === "ready" ? "分析可能" : "データ不足"}`,
    `記録数: ${summary.dataQuality.recordCount}`,
    `分析に使える値: ${summary.dataQuality.usableValueCount}`,
    `除外フィールド: ${summary.dataQuality.excludedFieldCount}`,
    `除外値: ${summary.dataQuality.excludedValueCount}`
  ];
  if (!summary.hypotheses.length) {
    lines.push("仮説: なし");
    lines.push(summary.dataQuality.recordCount === 0
      ? "案内: PCSでMarkdownを登録し、テンプレートの値を確認してから再実行してください。"
      : "案内: 対象期間、Review済み値、分析ロール、サンプル数を確認してください。");
    return lines.join("\n");
  }
  lines.push(`仮説: ${summary.hypotheses.length}件`);
  for (const [index, hypothesis] of summary.hypotheses.entries()) {
    lines.push(`${index + 1}. ${hypothesis.statement}`);
    if (hypothesis.sensitivitySummary) lines.push(`   sensitivity: ${hypothesis.sensitivitySummary.method} / minimum changes: ${hypothesis.sensitivitySummary.minimumChangesToCrossEffect ?? "unknown"}`);
    if (hypothesis.alternativeExplanations?.length) lines.push(`   alternatives: ${hypothesis.alternativeExplanations.join(", ")}`);
    lines.push(`   状態: ${hypothesis.status} / 確信度: ${hypothesis.confidence.toFixed(2)} / 支持: ${hypothesis.supportingEvidenceCount}件 / 反証: ${hypothesis.contradictingEvidenceCount}件`);
  }
  return lines.join("\n");
}
