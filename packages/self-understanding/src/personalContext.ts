import type { CandidateObservation, CandidateParameter } from "../../domain/src/hypothesis/candidates.ts";
import { generateSelfUnderstanding, type UnderstandingRecord } from "./index.ts";

export type PersonalContextSnapshotValue = {
  fieldKey: string;
  label: string;
  valueType: string;
  value: unknown;
  templateId: string;
  sourceDocumentId: string | null;
  allowedValues?: Array<{ key: string; label: string }>;
  analysisRole?: string | null;
  analysisRoleConfirmed?: boolean;
  analysisMergeAllowed?: boolean;
  minimum?: number | null;
  maximum?: number | null;
  unit?: string | null;
};

export type PersonalContextSnapshot = {
  schemaVersion: "pcs-analysis-snapshot-v1";
  generatedAt: string;
  records: Array<{ id: string; recordedAt: string; title: string; sourceDocumentId: string | null; values: PersonalContextSnapshotValue[] }>;
  excluded: { unconfirmed: number; nonShareable: number; invalid: number };
};

function supportedValue(value: PersonalContextSnapshotValue): boolean {
  if (value.valueType === "boolean") return typeof value.value === "boolean";
  if (value.valueType === "single_choice") return typeof value.value === "string";
  return ["number", "integer", "scale", "duration_minutes"].includes(value.valueType) && typeof value.value === "number" && Number.isFinite(value.value);
}

function parameterId(value: PersonalContextSnapshotValue): string {
  return `${value.templateId}:${value.fieldKey}`;
}

export function validatePersonalContextSnapshot(value: unknown): PersonalContextSnapshot {
  const snapshot = value as Partial<PersonalContextSnapshot>;
  if (!snapshot || snapshot.schemaVersion !== "pcs-analysis-snapshot-v1" || typeof snapshot.generatedAt !== "string" || Number.isNaN(Date.parse(snapshot.generatedAt)) || !Array.isArray(snapshot.records) || !snapshot.excluded || typeof snapshot.excluded !== "object") {
    throw new Error("pcs_analysis_snapshot_invalid");
  }
  return snapshot as PersonalContextSnapshot;
}

export function analyzePersonalContextSnapshot(snapshotInput: unknown, input: { startAt: string; endAt: string; minimumEntryCount?: number }) {
  const snapshot = validatePersonalContextSnapshot(snapshotInput);
  const minimumEntryCount = Math.max(8, Math.min(100, input.minimumEntryCount ?? 8));
  const parameterValues = new Map<string, PersonalContextSnapshotValue[]>();
  const records: UnderstandingRecord[] = [];
  const observations: CandidateObservation[] = [];
  for (const sourceRecord of snapshot.records) {
    if (Date.parse(sourceRecord.recordedAt) < Date.parse(input.startAt) || Date.parse(sourceRecord.recordedAt) > Date.parse(input.endAt)) continue;
    const record: UnderstandingRecord = { id: sourceRecord.id, recordedAt: sourceRecord.recordedAt, title: sourceRecord.title, kind: "entry", sourceEntryIds: [sourceRecord.id], conditionValues: {}, outcomeValues: {} };
    for (const value of sourceRecord.values.filter(supportedValue)) {
      const id = parameterId(value); const values = parameterValues.get(id) ?? []; values.push(value); parameterValues.set(id, values);
      record.conditionValues[id] = value.value; record.outcomeValues[id] = value.value;
      observations.push({ episodeId: sourceRecord.id, episodeKind: "entry", parameterId: id, value: value.value, observedAt: sourceRecord.recordedAt });
    }
    if (Object.keys(record.conditionValues).length) records.push(record);
  }
  if (records.length < minimumEntryCount) return { status: "insufficient", source: "personal_context_studio", period: { startAt: input.startAt, endAt: input.endAt }, entryCount: records.length, minimumEntryCount, excluded: snapshot.excluded, hypotheses: [] };
  const allowedValues: Record<string, Array<{ valueKey: string; labelJa: string }>> = {};
  const parameters: CandidateParameter[] = [...parameterValues.entries()].map(([id, values]) => {
    const first = values[0]; const numeric = values.map((value) => value.value).filter((value): value is number => typeof value === "number");
    if (first.allowedValues?.length) allowedValues[id] = first.allowedValues.map((item) => ({ valueKey: item.key, labelJa: item.label }));
    return {
      id,
      fieldKey: first.fieldKey,
      templateId: first.templateId,
      nameJa: first.label,
      valueType: ["integer", "scale", "duration_minutes"].includes(first.valueType) ? "number" : first.valueType,
      minimumValue: first.minimum ?? (numeric.length ? Math.min(...numeric) : undefined),
      maximumValue: first.maximum ?? (numeric.length ? Math.max(...numeric) : undefined),
      semanticRole: first.analysisRoleConfirmed && first.analysisMergeAllowed ? first.analysisRole ?? undefined : undefined,
      usableAsCondition: true,
      usableAsOutcome: true,
      sourceKind: "entry" as const
    };
  }).filter((parameter) => parameter.valueType === "boolean" || parameter.valueType === "single_choice" || ((parameter.minimumValue ?? 0) < (parameter.maximumValue ?? 0)));
  const hypotheses = generateSelfUnderstanding({ parameters, observations, records, allowedValues, now: input.endAt, config: { minimumTotalSamples: minimumEntryCount, maximumCandidates: 5 } });
  return { status: hypotheses.length ? "ready" : "insufficient", source: "personal_context_studio", period: { startAt: input.startAt, endAt: input.endAt }, entryCount: records.length, minimumEntryCount, excluded: snapshot.excluded, hypotheses, explanationMode: "deterministic_fallback" };
}
