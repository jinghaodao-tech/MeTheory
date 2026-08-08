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
import type { CandidateObservation, CandidateParameter } from "../../domain/src/hypothesis/candidates.ts";

export const PCS_CANDIDATE_PAIR_ALLOWLIST_VERSION = "candidate-pair-v1";

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
  }>;
};

export type PcsAnalysisResult = {
  status: "ready" | "insufficient";
  schemaVersion: typeof CONTEXT_ANALYSIS_SNAPSHOT_V2_VERSION;
  snapshotId: string;
  profileId: string;
  generatedAt: string;
  period: ContextAnalysisSnapshotV2["period"];
  dataQuality: {
    recordCount: number;
    usableValueCount: number;
    excludedFieldCount: number;
    excludedValueCount: number;
  };
  excludedFields: PcsExcludedField[];
  hypotheses: ReturnType<typeof generateSelfUnderstanding>;
  candidateEvidence: Array<{
    candidateId: string;
    supporting: PcsCandidateEvidence[];
    contradicting: PcsCandidateEvidence[];
  }>;
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
      privacyLevel: item.privacyLevel ?? "normal"
    })) : [];
  return { ...input.evidence, conditionValue, outcomeValue, provenance };
}

export function analyzePcsAnalysisSnapshot(input: unknown, options: { minimumTotalSamples?: number; maximumCandidates?: number } = {}): PcsAnalysisResult {
  const snapshot = validateContextAnalysisSnapshot(input);
  if (snapshot.schemaVersion !== CONTEXT_ANALYSIS_SNAPSHOT_V2_VERSION) throw new Error("pcs_snapshot_version_unsupported");
  const excludedFields: PcsExcludedField[] = [];
  const groups = new Map<string, FieldGroup>();
  const valuesByRecord = new Map<string, Map<string, unknown>>();
  const provenanceByRecord = new Map<string, Map<string, { source: "user_entry"; labelJa: string; observationIds: string[]; sourceId: string; transformVersion: string; privacyLevel: string; provenanceSource: "user_input" | "reviewed_ai_extraction" | "manual_import" }>>();
  let usableValueCount = 0;
  let excludedValueCount = snapshot.excluded.unconfirmed + snapshot.excluded.nonShareable + snapshot.excluded.highlySensitive + snapshot.excluded.invalid;

  for (const record of snapshot.records) {
    const values = new Map<string, unknown>();
    const provenance = new Map<string, { source: "user_entry"; labelJa: string; observationIds: string[]; sourceId: string; transformVersion: string; privacyLevel: string; provenanceSource: "user_input" | "reviewed_ai_extraction" | "manual_import" }>();
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
      provenance.set(id, { source: "user_entry", labelJa: sourceLabel(value.provenance.source), observationIds: [value.provenance.sourceId], sourceId: value.provenance.sourceId, transformVersion: value.provenance.transformVersion, privacyLevel: value.provenance.privacyLevel, provenanceSource: value.provenance.source });
      usableValueCount += 1;
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
    usableAsCondition: group.usage === "condition" || group.usage === "both",
    usableAsOutcome: group.usage === "outcome" || group.usage === "both",
    allowedConditionRoles: [],
    allowedOutcomeRoles: [],
    positiveValues: group.positiveValueKeys,
    orderedValues: group.orderedValueKeys,
    numericMapping: group.numericMapping
  }));

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
  const hypotheses = generateSelfUnderstanding({
    parameters,
    observations,
    records: [...records.values()],
    allowedValues: Object.fromEntries([...groups.values()].map((group) => [group.id, group.allowedValues ?? []])),
    now: snapshot.period.endAt,
    config: {
      minimumTotalSamples,
      minimumSamplesPerCohort: Math.max(3, Math.floor(minimumTotalSamples / 2)),
      maximumCandidates,
      pairAllowlistVersion: PCS_CANDIDATE_PAIR_ALLOWLIST_VERSION
    }
  });

  const candidateEvidence = hypotheses.map((candidate) => ({
    candidateId: candidate.id,
    supporting: candidate.supportingEvidence.map((evidence) => evidenceFor({ evidence, candidate, records, groups })),
    contradicting: candidate.contradictingEvidence.map((evidence) => evidenceFor({ evidence, candidate, records, groups }))
  }));
  return {
    status: hypotheses.length ? "ready" : "insufficient",
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    profileId: snapshot.profileId,
    generatedAt: snapshot.generatedAt,
    period: snapshot.period,
    dataQuality: { recordCount: snapshot.records.length, usableValueCount, excludedFieldCount: excludedFields.length, excludedValueCount },
    excludedFields,
    hypotheses,
    candidateEvidence
  };
}
