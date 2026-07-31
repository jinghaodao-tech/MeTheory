import { createHash } from "node:crypto";

export const PCS_ANALYSIS_CONTRACT_REVISION = "pcs-analysis-snapshot-v2.1";
export const pcsAnalysisSnapshotV2JsonSchema = {
  type: "object", required: ["schemaVersion", "snapshotId", "profileId", "period", "records"], additionalProperties: false,
  properties: { schemaVersion: { const: "pcs-analysis-snapshot-v2" }, snapshotId: { type: "string", minLength: 1 }, profileId: { type: "string", minLength: 1 }, period: { type: "object", required: ["from", "to", "timezone"], properties: { from: { type: "string" }, to: { type: "string" }, timezone: { type: "string", minLength: 1 } } }, records: { type: "array" } }
} as const;
export type PcsValueType = "boolean" | "number" | "single_choice";
export type PcsSnapshotRecord = {
  recordId: string; recordedAt: string; templateId: string; templateVersionId: string;
  fieldKey: string; valueType: PcsValueType; value: boolean | number | string | null;
  analysisRole: string; analysisRoleConfirmed: boolean; analysisUsage: "condition" | "outcome" | "both" | "excluded";
  analysisMergeAllowed: boolean; minimum?: number; maximum?: number; unit?: string;
  allowedValues?: string[]; excluded?: boolean;
};
export type PcsAnalysisSnapshotV2 = { schemaVersion: "pcs-analysis-snapshot-v2"; snapshotId: string; profileId: string; period: { from: string; to: string; timezone: string }; records: PcsSnapshotRecord[] };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function snapshotContentHash(snapshot: PcsAnalysisSnapshotV2): string { return createHash("sha256").update(canonical(snapshot)).digest("hex"); }
export function validatePcsAnalysisSnapshotV2(value: unknown): { ok: true; snapshot: PcsAnalysisSnapshotV2 } | { ok: false; error: string } {
  const v = value as Partial<PcsAnalysisSnapshotV2>;
  if (!v || v.schemaVersion !== "pcs-analysis-snapshot-v2" || !v.snapshotId || !v.profileId || !v.period || !Array.isArray(v.records)) return { ok: false, error: "pcs_snapshot_v2_invalid" };
  if (!v.period.from || !v.period.to || !v.period.timezone || !Number.isFinite(Date.parse(v.period.from)) || !Number.isFinite(Date.parse(v.period.to)) || Date.parse(v.period.from) >= Date.parse(v.period.to)) return { ok: false, error: "pcs_snapshot_period_invalid" };
  for (const record of v.records) {
    if (!record || !record.recordId || !record.recordedAt || !record.templateId || !record.templateVersionId || !record.fieldKey || !["boolean", "number", "single_choice"].includes(record.valueType ?? "") || !["condition", "outcome", "both", "excluded"].includes(record.analysisUsage ?? "")) return { ok: false, error: "pcs_snapshot_record_invalid" };
    if (!record.analysisRoleConfirmed && record.analysisUsage !== "excluded") return { ok: false, error: "pcs_snapshot_role_unconfirmed" };
    if (record.valueType === "number" && typeof record.value !== "number") return { ok: false, error: "pcs_snapshot_value_invalid" };
  }
  return { ok: true, snapshot: v as PcsAnalysisSnapshotV2 };
}
