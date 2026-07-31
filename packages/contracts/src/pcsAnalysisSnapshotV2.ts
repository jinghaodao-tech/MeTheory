export const PCS_ANALYSIS_SNAPSHOT_V2 = "pcs-analysis-snapshot-v2" as const;
export const PCS_ANALYSIS_CONTRACT_REVISION = "pcs-analysis-snapshot-v2.1" as const;

export type PcsAnalysisValueType =
  | "boolean"
  | "single_choice"
  | "number"
  | "integer"
  | "scale"
  | "duration_minutes";

export type PcsAnalysisUsage = "condition" | "outcome" | "both" | "excluded";
export type PcsAnalysisSource = "user_input" | "reviewed_ai_extraction" | "manual_import";
export type PcsAnalysisPrivacyLevel = "normal" | "sensitive";

export type PcsAnalysisSnapshotV2 = {
  schemaVersion: typeof PCS_ANALYSIS_SNAPSHOT_V2;
  contractRevision: typeof PCS_ANALYSIS_CONTRACT_REVISION;
  snapshotId: string;
  profileId: string;
  generatedAt: string;
  period: { startAt: string; endAt: string; timezone: string };
  records: Array<{
    id: string;
    recordedAt: string;
    title?: string;
    sourceDocumentId: string | null;
    values: Array<{
      fieldKey: string;
      label: string;
      valueType: PcsAnalysisValueType;
      value: unknown;
      templateId: string;
      templateVersionId: string;
      analysisRole: string;
      analysisRoleConfirmed: boolean;
      analysisUsage: PcsAnalysisUsage;
      analysisMergeAllowed: boolean;
      scaleFingerprint: string;
      unit?: string;
      minimum?: number;
      maximum?: number;
      allowedValues?: Array<{ key: string; label: string }>;
      provenance: {
        source: PcsAnalysisSource;
        sourceId: string;
        userConfirmed: true;
        recordedAt: string;
        transformVersion: string;
        privacyLevel: PcsAnalysisPrivacyLevel;
      };
    }>;
  }>;
  excluded: {
    unconfirmed: number;
    nonShareable: number;
    highlySensitive: number;
    invalid: number;
  };
};

export type PcsSnapshotValidationIssue = {
  path: string;
  code: string;
};

export type PcsSnapshotValidationResult =
  | { ok: true; value: PcsAnalysisSnapshotV2 }
  | { ok: false; errors: PcsSnapshotValidationIssue[] };

const topKeys = new Set(["schemaVersion", "contractRevision", "snapshotId", "profileId", "generatedAt", "period", "records", "excluded"]);
const periodKeys = new Set(["startAt", "endAt", "timezone"]);
const recordKeys = new Set(["id", "recordedAt", "title", "sourceDocumentId", "values"]);
const valueKeys = new Set(["fieldKey", "label", "valueType", "value", "templateId", "templateVersionId", "analysisRole", "analysisRoleConfirmed", "analysisUsage", "analysisMergeAllowed", "scaleFingerprint", "unit", "minimum", "maximum", "allowedValues", "provenance"]);
const provenanceKeys = new Set(["source", "sourceId", "userConfirmed", "recordedAt", "transformVersion", "privacyLevel"]);
const excludedKeys = new Set(["unconfirmed", "nonShareable", "highlySensitive", "invalid"]);
const valueTypes = new Set<PcsAnalysisValueType>(["boolean", "single_choice", "number", "integer", "scale", "duration_minutes"]);
const usages = new Set<PcsAnalysisUsage>(["condition", "outcome", "both", "excluded"]);
const sources = new Set<PcsAnalysisSource>(["user_input", "reviewed_ai_extraction", "manual_import"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function keysOnly(value: Record<string, unknown>, allowed: Set<string>, path: string, errors: PcsSnapshotValidationIssue[]) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push({ path: path ? `${path}.${key}` : key, code: "unknown_property" });
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function ianaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function validateValueType(value: Record<string, unknown>, path: string, errors: PcsSnapshotValidationIssue[]) {
  const type = value.valueType;
  if (!valueTypes.has(type as PcsAnalysisValueType)) {
    errors.push({ path: `${path}.valueType`, code: "value_type_unsupported" });
    return;
  }
  const item = value.value;
  if (type === "boolean" && typeof item !== "boolean") errors.push({ path: `${path}.value`, code: "boolean_required" });
  if (type === "single_choice") {
    if (typeof item !== "string") errors.push({ path: `${path}.value`, code: "choice_required" });
    const options = value.allowedValues;
    if (!Array.isArray(options) || !options.length) errors.push({ path: `${path}.allowedValues`, code: "allowed_values_required" });
    else if (typeof item === "string" && !options.some((option) => isRecord(option) && option.key === item)) errors.push({ path: `${path}.value`, code: "choice_not_allowed" });
  }
  if (["number", "integer", "scale", "duration_minutes"].includes(String(type)) && !finiteNumber(item)) errors.push({ path: `${path}.value`, code: "finite_number_required" });
  if (type === "integer" && finiteNumber(item) && !Number.isInteger(item)) errors.push({ path: `${path}.value`, code: "integer_required" });
  if (type === "duration_minutes" && finiteNumber(item) && item < 0) errors.push({ path: `${path}.value`, code: "duration_negative" });
  const minimum = value.minimum;
  const maximum = value.maximum;
  if (minimum !== undefined && !finiteNumber(minimum)) errors.push({ path: `${path}.minimum`, code: "minimum_invalid" });
  if (maximum !== undefined && !finiteNumber(maximum)) errors.push({ path: `${path}.maximum`, code: "maximum_invalid" });
  if (finiteNumber(minimum) && finiteNumber(maximum) && minimum > maximum) errors.push({ path, code: "range_invalid" });
  if (finiteNumber(item) && finiteNumber(minimum) && item < minimum) errors.push({ path: `${path}.value`, code: "below_minimum" });
  if (finiteNumber(item) && finiteNumber(maximum) && item > maximum) errors.push({ path: `${path}.value`, code: "above_maximum" });
  if (Array.isArray(value.allowedValues)) {
    const keys = new Set<string>();
    for (const [index, option] of value.allowedValues.entries()) {
      if (!isRecord(option) || !nonEmptyString(option.key) || !nonEmptyString(option.label) || keys.has(String(option.key))) errors.push({ path: `${path}.allowedValues[${index}]`, code: "allowed_value_invalid" });
      else keys.add(String(option.key));
    }
  }
}

export function validatePcsAnalysisSnapshotV2(input: unknown): PcsSnapshotValidationResult {
  const errors: PcsSnapshotValidationIssue[] = [];
  if (!isRecord(input)) return { ok: false, errors: [{ path: "", code: "object_required" }] };
  keysOnly(input, topKeys, "", errors);
  if (input.schemaVersion !== PCS_ANALYSIS_SNAPSHOT_V2) errors.push({ path: "schemaVersion", code: "contract_version_unsupported" });
  if (input.contractRevision !== PCS_ANALYSIS_CONTRACT_REVISION) errors.push({ path: "contractRevision", code: input.contractRevision === undefined ? "contract_revision_required" : "contract_revision_unsupported" });
  for (const key of ["snapshotId", "profileId"] as const) if (!nonEmptyString(input[key])) errors.push({ path: key, code: "non_empty_string_required" });
  if (!timestamp(input.generatedAt)) errors.push({ path: "generatedAt", code: "timestamp_invalid" });
  if (!isRecord(input.period)) errors.push({ path: "period", code: "period_required" });
  else {
    keysOnly(input.period, periodKeys, "period", errors);
    if (!timestamp(input.period.startAt)) errors.push({ path: "period.startAt", code: "timestamp_invalid" });
    if (!timestamp(input.period.endAt)) errors.push({ path: "period.endAt", code: "timestamp_invalid" });
    if (timestamp(input.period.startAt) && timestamp(input.period.endAt) && Date.parse(input.period.startAt) >= Date.parse(input.period.endAt)) errors.push({ path: "period", code: "period_order_invalid" });
    if (!ianaTimezone(input.period.timezone)) errors.push({ path: "period.timezone", code: "iana_timezone_invalid" });
  }
  if (!Array.isArray(input.records)) errors.push({ path: "records", code: "array_required" });
  else {
    const recordIds = new Set<string>();
    for (const [recordIndex, record] of input.records.entries()) {
      const path = `records[${recordIndex}]`;
      if (!isRecord(record)) { errors.push({ path, code: "object_required" }); continue; }
      keysOnly(record, recordKeys, path, errors);
      if (!nonEmptyString(record.id)) errors.push({ path: `${path}.id`, code: "non_empty_string_required" });
      else if (recordIds.has(record.id)) errors.push({ path: `${path}.id`, code: "duplicate_record_id" });
      else recordIds.add(record.id);
      if (!timestamp(record.recordedAt)) errors.push({ path: `${path}.recordedAt`, code: "timestamp_invalid" });
      if (timestamp(record.recordedAt) && isRecord(input.period) && timestamp(input.period.startAt) && timestamp(input.period.endAt) && (Date.parse(record.recordedAt) < Date.parse(input.period.startAt) || Date.parse(record.recordedAt) > Date.parse(input.period.endAt))) errors.push({ path: `${path}.recordedAt`, code: "record_outside_period" });
      if (record.title !== undefined && typeof record.title !== "string") errors.push({ path: `${path}.title`, code: "string_required" });
      if (record.sourceDocumentId !== null && !nonEmptyString(record.sourceDocumentId)) errors.push({ path: `${path}.sourceDocumentId`, code: "source_document_id_invalid" });
      if (!Array.isArray(record.values)) { errors.push({ path: `${path}.values`, code: "array_required" }); continue; }
      const fieldKeys = new Set<string>();
      for (const [valueIndex, value] of record.values.entries()) {
        const valuePath = `${path}.values[${valueIndex}]`;
        if (!isRecord(value)) { errors.push({ path: valuePath, code: "object_required" }); continue; }
        keysOnly(value, valueKeys, valuePath, errors);
        if (!/^[a-z][a-z0-9_.-]{0,127}$/.test(String(value.fieldKey ?? ""))) errors.push({ path: `${valuePath}.fieldKey`, code: "field_key_invalid" });
        if (fieldKeys.has(String(value.fieldKey))) errors.push({ path: `${valuePath}.fieldKey`, code: "duplicate_field_key" });
        fieldKeys.add(String(value.fieldKey));
        if (!nonEmptyString(value.label)) errors.push({ path: `${valuePath}.label`, code: "label_required" });
        if (!nonEmptyString(value.templateId)) errors.push({ path: `${valuePath}.templateId`, code: "template_id_required" });
        if (!nonEmptyString(value.templateVersionId)) errors.push({ path: `${valuePath}.templateVersionId`, code: "template_version_required" });
        if (!/^[a-z][a-z0-9_.-]{0,127}$/.test(String(value.analysisRole ?? ""))) errors.push({ path: `${valuePath}.analysisRole`, code: "analysis_role_invalid" });
        if (value.analysisRoleConfirmed !== true) errors.push({ path: `${valuePath}.analysisRoleConfirmed`, code: "analysis_role_unconfirmed" });
        if (!usages.has(value.analysisUsage as PcsAnalysisUsage)) errors.push({ path: `${valuePath}.analysisUsage`, code: "analysis_usage_invalid" });
        if (typeof value.analysisMergeAllowed !== "boolean") errors.push({ path: `${valuePath}.analysisMergeAllowed`, code: "analysis_merge_flag_invalid" });
        if (!nonEmptyString(value.scaleFingerprint)) errors.push({ path: `${valuePath}.scaleFingerprint`, code: "scale_fingerprint_required" });
        if (value.unit !== undefined && typeof value.unit !== "string") errors.push({ path: `${valuePath}.unit`, code: "unit_invalid" });
        validateValueType(value, valuePath, errors);
        if (!isRecord(value.provenance)) { errors.push({ path: `${valuePath}.provenance`, code: "provenance_required" }); }
        else {
          keysOnly(value.provenance, provenanceKeys, `${valuePath}.provenance`, errors);
          if (!sources.has(value.provenance.source as PcsAnalysisSource)) errors.push({ path: `${valuePath}.provenance.source`, code: "provenance_source_invalid" });
          if (!nonEmptyString(value.provenance.sourceId)) errors.push({ path: `${valuePath}.provenance.sourceId`, code: "provenance_source_id_required" });
          if (value.provenance.userConfirmed !== true) errors.push({ path: `${valuePath}.provenance.userConfirmed`, code: "provenance_confirmation_required" });
          if (!timestamp(value.provenance.recordedAt)) errors.push({ path: `${valuePath}.provenance.recordedAt`, code: "provenance_timestamp_invalid" });
          if (!nonEmptyString(value.provenance.transformVersion)) errors.push({ path: `${valuePath}.provenance.transformVersion`, code: "provenance_transform_required" });
          if (!["normal", "sensitive"].includes(String(value.provenance.privacyLevel))) errors.push({ path: `${valuePath}.provenance.privacyLevel`, code: "provenance_privacy_invalid" });
        }
      }
    }
  }
  if (!isRecord(input.excluded)) errors.push({ path: "excluded", code: "excluded_required" });
  else {
    keysOnly(input.excluded, excludedKeys, "excluded", errors);
    for (const key of ["unconfirmed", "nonShareable", "highlySensitive", "invalid"] as const) if (!nonNegativeInteger(input.excluded[key])) errors.push({ path: `excluded.${key}`, code: "excluded_count_invalid" });
  }
  return errors.length ? { ok: false, errors: errors.slice(0, 100) } : { ok: true, value: input as PcsAnalysisSnapshotV2 };
}

export function assertValidPcsAnalysisSnapshotV2(input: unknown): PcsAnalysisSnapshotV2 {
  const result = validatePcsAnalysisSnapshotV2(input);
  if (!result.ok) throw new Error(`pcs_snapshot_invalid:${result.errors.map((item) => item.code).join(",")}`);
  return result.value;
}
