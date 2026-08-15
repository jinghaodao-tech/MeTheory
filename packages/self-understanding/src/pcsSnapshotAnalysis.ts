import {
  CONTEXT_ANALYSIS_SNAPSHOT_V2_VERSION,
  validateContextAnalysisSnapshot,
  type ContextAnalysisSnapshotV2,
  type ContextAnalysisValueV2
} from "personal-context-studio/integration-contracts";
type PcsAnalysisUsage = ContextAnalysisValueV2["analysisUsage"];
import { isSelfUnderstandingSemanticRole, type SelfUnderstandingSemanticRole } from "./semanticRoles.ts";
import {
  generateSelfUnderstanding,
  type EvidenceView,
  type UnderstandingRecord
} from "./index.ts";
import type { CandidateGenerationAudit, CandidateObservation, CandidateParameter } from "../../domain/src/hypothesis/candidates.ts";
import { validatePcsAnalysisSnapshotV3, type PcsAnalysisSnapshotV3 } from "../../contracts/src/pcsAnalysisSnapshotV3.ts";

export const PCS_CANDIDATE_PAIR_ALLOWLIST_VERSION = "candidate-pair-v2";

export type PcsExcludedField = {
  templateId: string;
  templateVersionId: string;
  fieldKey: string;
  label: string;
  reason:
    | "analysis_role_unconfirmed"
    | "analysis_role_unknown"
    | "analysis_usage_excluded"
    | "value_type_unsupported"
    | "scale_invalid"
    | "merge_not_allowed"
    | "privacy_not_allowed"
    | "applicability_unresolved";
};

export type PcsCandidateEvidence = EvidenceView & {
  conditionValue: unknown;
  outcomeValue: unknown;
  provenance: Array<{
    source: string;
    sourceId: string;
    transformVersion: string;
    privacyLevel: string;
    sourceTool?: string;
    measurementDefinitionVersion?: string;
  }>;
};

export type PcsAnalysisResult = {
  status: "ready" | "insufficient";
  schemaVersion: typeof CONTEXT_ANALYSIS_SNAPSHOT_V2_VERSION | PcsAnalysisSnapshotV3["schemaVersion"];
  snapshotId: string;
  profileId: string;
  generatedAt: string;
  period: ContextAnalysisSnapshotV2["period"];
  dataQuality: {
    recordCount: number;
    usableValueCount: number;
    excludedFieldCount: number;
    excludedValueCount: number;
    coverage?: {
      calendarSpanDays: number;
      observedRecordDays: number;
      missingRecordDays: number;
      missingRecordRate: number;
      recordPresencePolicy: "records_present_only";
    };
  };
  practicalThresholds: Array<{ fieldKey: string; minimumDifference: number; unit?: string; rationale: string }>;
  excludedFields: PcsExcludedField[];
  candidateAudit: CandidateGenerationAudit;
  hypotheses: ReturnType<typeof generateSelfUnderstanding>;
  candidateEvidence: Array<{
    candidateId: string;
    supporting: PcsCandidateEvidence[];
    contradicting: PcsCandidateEvidence[];
  }>;
  robustness: {
    totalObservedDefinition: "active_minutes + ai_conversation_minutes + deep_thinking_minutes + idle_minutes + away_minutes";
    totalObservedMedian: number | null;
    continuousAssociations: Array<{
      condition: "ai_conversation_ratio";
      outcome: "deep_thinking_ratio";
      method: "pearson_correlation";
      scope: "all" | "short_total_observed" | "long_total_observed";
      recordCount: number;
      pearsonR: number | null;
      slope: number | null;
    }>;
    ratioComparison: Array<{
      scope: "all" | "short_total_observed" | "long_total_observed";
      recordCount: number;
      conditionMedian: number | null;
      lowConditionOutcomeRatio: number | null;
      highConditionOutcomeRatio: number | null;
      effectLowMinusHigh: number | null;
    }>;
  };
};

type FieldGroup = {
  id: string;
  fieldKey: string;
  label: string;
  templateId: string;
  templateVersionId: string;
  role: SelfUnderstandingSemanticRole;
  usage: PcsAnalysisUsage;
  valueType: CandidateParameter["valueType"];
  minimum?: number;
  maximum?: number;
  unit?: string;
  scaleFingerprint: string;
  allowedValues?: Array<{ valueKey: string; labelJa: string }>;
  positiveValueKeys?: string[];
  orderedValueKeys?: string[];
  numericMapping?: Record<string, number>;
};

const supportedValueTypes = new Set(["boolean", "single_choice", "number", "integer", "scale", "duration_minutes"]);

function candidateValueType(valueType: string): CandidateParameter["valueType"] {
  return valueType === "scale" || valueType === "duration_minutes" || valueType === "integer" ? "number" : valueType;
}

function canonicalAllowedValues(value: ContextAnalysisSnapshotV2["records"][number]["values"][number]) {
  return JSON.stringify((value.allowedValues ?? []).map((item) => item.key));
}

function isolatedParameterId(value: ContextAnalysisSnapshotV2["records"][number]["values"][number]) {
  return ["isolated", value.templateId, value.templateVersionId, value.fieldKey].join(":");
}

function mergedParameterId(value: ContextAnalysisSnapshotV2["records"][number]["values"][number]) {
  return ["merged", value.analysisRole, value.analysisUsage, value.valueType, value.scaleFingerprint, value.unit ?? "", value.minimum ?? "", value.maximum ?? "", canonicalAllowedValues(value), JSON.stringify(value.positiveValueKeys ?? []), JSON.stringify(value.orderedValueKeys ?? []), JSON.stringify(value.numericMapping ?? {}), value.provenance.privacyLevel].join(":");
}

export function pcsParameterIdentity(value: unknown) {
  const typed = value as ContextAnalysisSnapshotV2["records"][number]["values"][number];
  return typed.analysisMergeAllowed ? mergedParameterId(typed) : isolatedParameterId(typed);
}
function excludedField(value: ContextAnalysisSnapshotV2["records"][number]["values"][number], reason: PcsExcludedField["reason"]): PcsExcludedField {
  return { templateId: value.templateId, templateVersionId: value.templateVersionId, fieldKey: value.fieldKey, label: value.label, reason };
}

function sourceLabel(source: string) {
  if (source === "reviewed_ai_extraction") return "PCS reviewed extraction";
  if (source === "manual_import") return "PCS manual import";
  if (source === "system") return "PCS machine measurement";
  return "PCS user input";
}

function evidenceFor(input: {
  evidence: EvidenceView;
  candidate: ReturnType<typeof generateSelfUnderstanding>[number];
  records: Map<string, UnderstandingRecord>;
  groups: Map<string, FieldGroup>;
}): PcsCandidateEvidence {
  const record = input.records.get(input.evidence.episodeId);
  const conditionId = input.candidate.candidate.conditionParameterId;
  const outcomeId = input.candidate.candidate.outcomeParameterId;
  const conditionValue = record?.conditionValues[conditionId] ?? null;
  const outcomeValue = record?.outcomeValues[outcomeId] ?? null;
  const provenance = record ? [conditionId, outcomeId]
    .map((parameterId) => record.provenanceByParameterId?.[parameterId])
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      source: item.provenanceSource ?? item.source,
      sourceId: item.sourceId ?? item.observationIds?.[0] ?? record.id,
      transformVersion: item.transformVersion ?? "pcs-analysis-snapshot-v2",
      privacyLevel: item.privacyLevel ?? "normal",
      ...(item.sourceTool ? { sourceTool: item.sourceTool } : {}),
      ...(item.measurementDefinitionVersion ? { measurementDefinitionVersion: item.measurementDefinitionVersion } : {})
    })) : [];
  return { ...input.evidence, conditionValue, outcomeValue, provenance };
}

export function analyzePcsAnalysisSnapshot(input: unknown, options: { minimumTotalSamples?: number; maximumCandidates?: number } = {}): PcsAnalysisResult {
  const snapshot = ((input as any)?.schemaVersion === "pcs-analysis-snapshot-v3"
    ? validatePcsAnalysisSnapshotV3(input)
    : validateContextAnalysisSnapshot(input)) as unknown as ContextAnalysisSnapshotV2;
  if (snapshot.schemaVersion !== CONTEXT_ANALYSIS_SNAPSHOT_V2_VERSION && (snapshot as any).schemaVersion !== "pcs-analysis-snapshot-v3") throw new Error("pcs_snapshot_version_unsupported");
  const excludedFields: PcsExcludedField[] = [];
  const groups = new Map<string, FieldGroup>();
  const valuesByRecord = new Map<string, Map<string, unknown>>();
  const provenanceByRecord = new Map<string, Map<string, { source: "user_entry"; labelJa: string; observationIds: string[]; sourceId: string; transformVersion: string; privacyLevel: string; provenanceSource: string; sourceTool?: string; measurementDefinitionVersion?: string }>>();
  let usableValueCount = 0;
  let excludedValueCount = snapshot.excluded.unconfirmed + snapshot.excluded.nonShareable + snapshot.excluded.highlySensitive + snapshot.excluded.invalid;

  for (const record of snapshot.records) {
    const values = new Map<string, unknown>();
    const provenance = new Map<string, { source: "user_entry"; labelJa: string; observationIds: string[]; sourceId: string; transformVersion: string; privacyLevel: string; provenanceSource: string; sourceTool?: string; measurementDefinitionVersion?: string }>();
    for (const value of record.values) {
      if ((value as ContextAnalysisValueV2 & { applicability?: unknown[] }).applicability?.length) { excludedFields.push(excludedField(value, "applicability_unresolved")); excludedValueCount += 1; continue; }
      if (!value.analysisRoleConfirmed) { excludedFields.push(excludedField(value, "analysis_role_unconfirmed")); excludedValueCount += 1; continue; }
      if (!isSelfUnderstandingSemanticRole(value.analysisRole)) { excludedFields.push(excludedField(value, "analysis_role_unknown")); excludedValueCount += 1; continue; }
      if (value.analysisUsage === "excluded") { excludedFields.push(excludedField(value, "analysis_usage_excluded")); excludedValueCount += 1; continue; }
      if (!supportedValueTypes.has(value.valueType)) { excludedFields.push(excludedField(value, "value_type_unsupported")); excludedValueCount += 1; continue; }
      if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) { excludedFields.push(excludedField(value, "scale_invalid")); excludedValueCount += 1; continue; }
      const id = pcsParameterIdentity(value);
      if (!groups.has(id)) groups.set(id, {
        id,
        fieldKey: value.fieldKey,
        label: value.label,
        templateId: value.templateId,
        templateVersionId: value.templateVersionId,
        role: value.analysisRole,
        usage: value.analysisUsage,
        valueType: candidateValueType(value.valueType),
        minimum: value.minimum,
        maximum: value.maximum,
        unit: value.unit,
        scaleFingerprint: value.scaleFingerprint,
        allowedValues: value.allowedValues?.map((item) => ({ valueKey: item.key, labelJa: item.label })),
        positiveValueKeys: value.positiveValueKeys,
        orderedValueKeys: value.orderedValueKeys,
        numericMapping: value.numericMapping
      });
      values.set(id, value.value);
      provenance.set(id, { source: "user_entry", labelJa: sourceLabel(value.provenance.source), observationIds: [value.provenance.sourceId], sourceId: value.provenance.sourceId, transformVersion: value.provenance.transformVersion, privacyLevel: value.provenance.privacyLevel, provenanceSource: value.provenance.source, sourceTool: (value as any).measurement?.sourceTool, measurementDefinitionVersion: (value as any).measurement?.definitionVersion });
      usableValueCount += 1;
    }
    const hourly = record.values.find((item) => item.fieldKey === "hourly_active_minutes");
    if (hourly?.fieldKey === "hourly_active_minutes" && String(hourly.valueType) === "long_text" && typeof hourly.value === "string") {
      try {
        const vector = JSON.parse(hourly.value) as unknown;
        if (Array.isArray(vector) && vector.length === 24 && vector.every((item) => typeof item === "number" && Number.isFinite(item))) {
          for (const [hour, item] of vector.entries()) {
            const id = `hourly:${hour}`;
            if (!groups.has(id)) groups.set(id, { id, fieldKey: `hourly_active_minutes_${String(hour).padStart(2, "0")}`, label: `${String(hour).padStart(2, "0")}時の活動時間`, templateId: hourly.templateId, templateVersionId: hourly.templateVersionId, role: "time_of_day", usage: "condition", valueType: "number", minimum: 0, maximum: 1440, unit: "minutes", scaleFingerprint: "derived-hourly|0|1440|minutes", });
            values.set(id, item);
            provenance.set(id, { source: "user_entry", labelJa: "PCS machine measurement", observationIds: [String(hourly.provenance.sourceId)], sourceId: String(hourly.provenance.sourceId), transformVersion: "pcs-hourly-v1", privacyLevel: hourly.provenance.privacyLevel, provenanceSource: hourly.provenance.source, sourceTool: (hourly as any).measurement?.sourceTool, measurementDefinitionVersion: (hourly as any).measurement?.definitionVersion });
          }
        }
      } catch { /* malformed hourly vectors remain excluded */ }
    }
    valuesByRecord.set(record.id, values);
    provenanceByRecord.set(record.id, provenance);
  }

  const parameters: CandidateParameter[] = [...groups.values()].map((group) => ({
    id: group.id,
    fieldKey: group.fieldKey,
    templateId: group.templateId,
    templateVersionId: group.templateVersionId,
    semanticRole: group.role,
    semanticMergeAllowed: true,
    scaleFingerprint: group.scaleFingerprint,
    unit: group.unit,
    sourceKind: "entry",
    nameJa: group.label,
    valueType: group.valueType,
    minimumValue: group.minimum,
    maximumValue: group.maximum,
    ...(group.fieldKey === "deep_thinking_minutes" ? { minimumMeaningfulDifference: 30 } : {}),
    usableAsCondition: group.usage === "condition" || group.usage === "both",
    usableAsOutcome: group.usage === "outcome" || group.usage === "both",
    allowedConditionRoles: [],
    allowedOutcomeRoles: [],
    positiveValues: group.positiveValueKeys,
    orderedValues: group.orderedValueKeys,
    numericMapping: group.numericMapping,
    cohortStrategy: group.scaleFingerprint.startsWith("scale-") ? "range_midpoint" : "observed_median",
    observedValues: snapshot.records.flatMap((record) => { const value = valuesByRecord.get(record.id)?.get(group.id); return typeof value === "number" && Number.isFinite(value) ? [value] : []; })
  }));

  // Derive duration-normalized values and a total-duration stratum without replacing
  // the original measurements. This makes duration confounding testable in the same run.
  const sourceByRole = (role: SelfUnderstandingSemanticRole) => [...groups.values()].find((group) => group.role === role);
  const aiGroup = sourceByRole("ai_conversation_intensity");
  const focusGroup = sourceByRole("focus");
  const numberFor = (recordId: string, group?: FieldGroup) => {
    const value = group ? valuesByRecord.get(recordId)?.get(group.id) : undefined;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const rawNumberFor = (record: ContextAnalysisSnapshotV2["records"][number], fieldKey: string) => {
    const value = record.values.find((item) => item.fieldKey === fieldKey)?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const totals = snapshot.records.map((record) => {
    // ADR-016: total_observed must cover all five dev-pace states. Summing only
    // active/idle/away (the previous formula) excludes exactly the two fields
    // used as ratio numerators below, so a day that is mostly deep-thinking or
    // AI-conversation time got an artificially small (or zero) denominator and
    // could be silently dropped by the `total > 0` filter -- the days most
    // relevant to what this analysis measures were the ones most likely to be
    // excluded from it.
    const values = [rawNumberFor(record, "active_minutes"), rawNumberFor(record, "ai_conversation_minutes"), rawNumberFor(record, "deep_thinking_minutes"), rawNumberFor(record, "idle_minutes"), rawNumberFor(record, "away_minutes")];
    return { recordId: record.id, total: values.every((value) => value !== null) ? values.reduce((sum, value) => sum + (value ?? 0), 0) : null };
  }).filter((item): item is { recordId: string; total: number } => item.total !== null && item.total > 0);
  const sortedTotals = totals.map((item) => item.total).sort((left, right) => left - right);
  const totalMedian = sortedTotals.length ? sortedTotals.length % 2 ? sortedTotals[(sortedTotals.length - 1) / 2] : (sortedTotals[sortedTotals.length / 2 - 1] + sortedTotals[sortedTotals.length / 2]) / 2 : null;
  const derivedGroups: Array<{ id: string; fieldKey: string; label: string; role: SelfUnderstandingSemanticRole; usage: "condition" | "outcome"; valueType: CandidateParameter["valueType"]; minimum?: number; maximum?: number; unit?: string; scaleFingerprint: string; allowedValues?: Array<{ valueKey: string; labelJa: string }> }> = [];
  let robustness: PcsAnalysisResult["robustness"] = {
    totalObservedDefinition: "active_minutes + ai_conversation_minutes + deep_thinking_minutes + idle_minutes + away_minutes",
    totalObservedMedian: totalMedian,
    continuousAssociations: [],
    ratioComparison: []
  };
  if (aiGroup && focusGroup && totalMedian !== null) {
    derivedGroups.push({ id: "derived:ai_conversation_ratio", fieldKey: "ai_conversation_ratio", label: "AI conversation ratio", role: "ai_conversation_intensity", usage: "condition", valueType: "number", minimum: 0, maximum: 1, unit: "ratio", scaleFingerprint: "derived-ratio-v1" });
    derivedGroups.push({ id: "derived:deep_thinking_ratio", fieldKey: "deep_thinking_ratio", label: "Deep thinking ratio", role: "focus", usage: "outcome", valueType: "number", minimum: 0, maximum: 1, unit: "ratio", scaleFingerprint: "derived-ratio-v1" });
    derivedGroups.push({ id: "derived:total_observed_stratum", fieldKey: "total_observed_stratum", label: "Total observed duration stratum", role: "active_duration", usage: "condition", valueType: "single_choice", scaleFingerprint: "derived-duration-stratum-v1", allowedValues: [{ valueKey: "short", labelJa: "短時間" }, { valueKey: "long", labelJa: "長時間" }] });
    for (const record of snapshot.records) {
      const total = totals.find((item) => item.recordId === record.id)?.total;
      const ai = numberFor(record.id, aiGroup);
      const focus = numberFor(record.id, focusGroup);
      const provenance = provenanceByRecord.get(record.id);
      const base = provenance?.get(aiGroup.id) ?? provenance?.get(focusGroup.id);
      if (total === undefined || total === null || !base) continue;
      const derived = valuesByRecord.get(record.id)!;
      if (ai !== null) derived.set("derived:ai_conversation_ratio", ai / total);
      if (focus !== null) derived.set("derived:deep_thinking_ratio", focus / total);
      derived.set("derived:total_observed_stratum", total < totalMedian ? "short" : "long");
      provenance?.set("derived:ai_conversation_ratio", { ...base, transformVersion: "dev-pace-ratio-v1", measurementDefinitionVersion: "dev-pace-ratio-v1" });
      provenance?.set("derived:deep_thinking_ratio", { ...base, transformVersion: "dev-pace-ratio-v1", measurementDefinitionVersion: "dev-pace-ratio-v1" });
      provenance?.set("derived:total_observed_stratum", { ...base, transformVersion: "dev-pace-duration-stratum-v1", measurementDefinitionVersion: "dev-pace-duration-stratum-v1" });
    }
    for (const group of derivedGroups) parameters.push({ id: group.id, fieldKey: group.fieldKey, templateId: "derived-dev-pace", templateVersionId: "v1", semanticRole: group.role, semanticMergeAllowed: false, scaleFingerprint: group.scaleFingerprint, unit: group.unit, sourceKind: "entry", nameJa: group.label, valueType: group.valueType, minimumValue: group.minimum, maximumValue: group.maximum, usableAsCondition: group.usage === "condition", usableAsOutcome: group.usage === "outcome", allowedConditionRoles: [], allowedOutcomeRoles: [], cohortStrategy: group.valueType === "number" ? "observed_median" : undefined, observedValues: group.valueType === "number" ? snapshot.records.flatMap((record) => { const value = valuesByRecord.get(record.id)?.get(group.id); return typeof value === "number" && Number.isFinite(value) ? [value] : []; }) : undefined });

    const median = (values: number[]) => {
      const sorted = [...values].sort((left, right) => left - right);
      if (!sorted.length) return null;
      return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    };
    const ratioRows = snapshot.records.flatMap((record) => {
      const total = totals.find((item) => item.recordId === record.id)?.total;
      const ai = valuesByRecord.get(record.id)?.get("derived:ai_conversation_ratio");
      const focus = valuesByRecord.get(record.id)?.get("derived:deep_thinking_ratio");
      return typeof total === "number" && typeof ai === "number" && typeof focus === "number"
        ? [{ total, condition: ai, outcome: focus }]
        : [];
    });
    const association = (scope: "all" | "short_total_observed" | "long_total_observed", rows: typeof ratioRows) => {
      if (rows.length < 3) return { condition: "ai_conversation_ratio" as const, outcome: "deep_thinking_ratio" as const, method: "pearson_correlation" as const, scope, recordCount: rows.length, pearsonR: null, slope: null };
      const meanX = rows.reduce((sum, row) => sum + row.condition, 0) / rows.length;
      const meanY = rows.reduce((sum, row) => sum + row.outcome, 0) / rows.length;
      const covariance = rows.reduce((sum, row) => sum + (row.condition - meanX) * (row.outcome - meanY), 0);
      const varianceX = rows.reduce((sum, row) => sum + (row.condition - meanX) ** 2, 0);
      const varianceY = rows.reduce((sum, row) => sum + (row.outcome - meanY) ** 2, 0);
      return { condition: "ai_conversation_ratio" as const, outcome: "deep_thinking_ratio" as const, method: "pearson_correlation" as const, scope, recordCount: rows.length, pearsonR: varianceX > 0 && varianceY > 0 ? covariance / Math.sqrt(varianceX * varianceY) : null, slope: varianceX > 0 ? covariance / varianceX : null };
    };
    const summarize = (scope: "all" | "short_total_observed" | "long_total_observed", rows: typeof ratioRows) => {
      const conditionMedian = median(rows.map((row) => row.condition));
      if (conditionMedian === null) return { scope, recordCount: rows.length, conditionMedian: null, lowConditionOutcomeRatio: null, highConditionOutcomeRatio: null, effectLowMinusHigh: null };
      const low = rows.filter((row) => row.condition < conditionMedian).map((row) => row.outcome);
      const high = rows.filter((row) => row.condition >= conditionMedian).map((row) => row.outcome);
      const lowMedian = median(low);
      const highMedian = median(high);
      return { scope, recordCount: rows.length, conditionMedian, lowConditionOutcomeRatio: lowMedian, highConditionOutcomeRatio: highMedian, effectLowMinusHigh: lowMedian !== null && highMedian !== null ? lowMedian - highMedian : null };
    };
    robustness = {
      totalObservedDefinition: "active_minutes + ai_conversation_minutes + deep_thinking_minutes + idle_minutes + away_minutes",
      totalObservedMedian: totalMedian,
      continuousAssociations: [
        association("all", ratioRows),
        association("short_total_observed", ratioRows.filter((row) => row.total < totalMedian)),
        association("long_total_observed", ratioRows.filter((row) => row.total >= totalMedian))
      ],
      ratioComparison: [
        summarize("all", ratioRows),
        summarize("short_total_observed", ratioRows.filter((row) => row.total < totalMedian)),
        summarize("long_total_observed", ratioRows.filter((row) => row.total >= totalMedian))
      ]
    };
  }

  const records = new Map<string, UnderstandingRecord>();
  const observations: CandidateObservation[] = [];
  for (const source of snapshot.records) {
    const values = valuesByRecord.get(source.id) ?? new Map<string, unknown>();
    const provenance = provenanceByRecord.get(source.id) ?? new Map();
    const record: UnderstandingRecord = {
      id: source.id,
      recordedAt: source.recordedAt,
      title: source.title ?? source.id,
      kind: "pcs_record",
      localDate: source.recordedAt.slice(0, 10),
      sourceEntryIds: [source.id],
      sourceObservationIds: [...provenance.values()].flatMap((item) => item.observationIds),
      provenanceByParameterId: Object.fromEntries(provenance),
      conditionValues: Object.fromEntries(values),
      outcomeValues: Object.fromEntries(values)
    };
    records.set(source.id, record);
    for (const [parameterId, value] of values) observations.push({
      episodeId: source.id,
      episodeKind: "pcs_record",
      parameterId,
      value,
      isMissing: value === null || value === undefined,
      observedAt: source.recordedAt
    });
  }

  const minimumTotalSamples = Math.max(8, Math.min(1000, Number.isFinite(options.minimumTotalSamples) ? Math.floor(options.minimumTotalSamples!) : 8));
  const maximumCandidates = Math.max(1, Math.min(10, Number.isFinite(options.maximumCandidates) ? Math.floor(options.maximumCandidates!) : 5));
  const snapshotStart = Date.parse(snapshot.period.startAt);
  const snapshotEnd = Date.parse(snapshot.period.endAt);
  const lookbackDays = Number.isFinite(snapshotStart) && Number.isFinite(snapshotEnd)
    ? Math.max(1, Math.ceil((snapshotEnd - snapshotStart) / 86400000) + 1)
    : undefined;
  const hypotheses = generateSelfUnderstanding({
    parameters,
    observations,
    records: [...records.values()],
    allowedValues: Object.fromEntries([...groups.values(), ...derivedGroups.map((group) => ({ ...group, allowedValues: group.allowedValues }))].map((group) => [group.id, group.allowedValues ?? []])),
    now: snapshot.period.endAt,
    config: {
      minimumTotalSamples,
      minimumSamplesPerCohort: Math.max(3, Math.floor(minimumTotalSamples / 2)),
      maximumCandidates,
      ...(lookbackDays === undefined ? {} : { lookbackDays }),
      pairAllowlistVersion: PCS_CANDIDATE_PAIR_ALLOWLIST_VERSION
    }
  });

  const candidateEvidence = hypotheses.map((candidate) => ({
    candidateId: candidate.id,
    supporting: candidate.supportingEvidence.map((evidence) => evidenceFor({ evidence, candidate, records, groups })),
    contradicting: candidate.contradictingEvidence.map((evidence) => evidenceFor({ evidence, candidate, records, groups }))
  }));
  const recordDates = snapshot.records.map((record) => record.recordedAt.slice(0, 10)).filter(Boolean);
  const uniqueRecordDates = [...new Set(recordDates)].sort();
  const firstRecordDate = uniqueRecordDates[0] ? Date.parse(`${uniqueRecordDates[0]}T00:00:00.000Z`) : NaN;
  const lastRecordDate = uniqueRecordDates.at(-1) ? Date.parse(`${uniqueRecordDates.at(-1)}T00:00:00.000Z`) : NaN;
  const calendarSpanDays = Number.isFinite(firstRecordDate) && Number.isFinite(lastRecordDate) ? Math.floor((lastRecordDate - firstRecordDate) / 86400000) + 1 : 0;
  const missingRecordDays = Math.max(0, calendarSpanDays - uniqueRecordDates.length);
  const practicalThresholds = [...groups.values()].filter((group) => group.fieldKey === "deep_thinking_minutes").map((group) => ({ fieldKey: group.fieldKey, minimumDifference: 30, unit: group.unit, rationale: "30分未満の差は行動上の意味が未定義のため候補として報告しない" }));
  return {
    status: hypotheses.length ? "ready" : "insufficient",
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    profileId: snapshot.profileId,
    generatedAt: snapshot.generatedAt,
    period: snapshot.period,
    dataQuality: { recordCount: snapshot.records.length, usableValueCount, excludedFieldCount: excludedFields.length, excludedValueCount, coverage: { calendarSpanDays, observedRecordDays: uniqueRecordDates.length, missingRecordDays, missingRecordRate: calendarSpanDays ? missingRecordDays / calendarSpanDays : 0, recordPresencePolicy: "records_present_only" } },
    practicalThresholds,
    excludedFields,
    candidateAudit: (hypotheses as typeof hypotheses & { candidateAudit?: CandidateGenerationAudit }).candidateAudit ?? { comparisonCount: 0, preSignificanceCandidates: 0, significanceRejectedCandidates: 0, acceptedCandidatesBeforeLimit: 0, suppressedByDisplayLimit: 0, rejectedBySampleSize: 0, rejectedByEffect: 0, rejectedByBalance: 0, rejectedByMissingRate: 0 },
    hypotheses,
    candidateEvidence,
    robustness
  };
}
