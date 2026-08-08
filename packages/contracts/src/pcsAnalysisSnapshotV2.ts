import {
  validateContextAnalysisSnapshot,
  type ContextAnalysisSnapshotV2
} from "personal-context-studio/integration-contracts";

export type PcsAnalysisSnapshotV2 = ContextAnalysisSnapshotV2;
export type PcsSnapshotValidationIssue = { path: string; message: string };
export type PcsSnapshotValidationResult =
  | { ok: true; value: PcsAnalysisSnapshotV2 }
  | { ok: false; errors: PcsSnapshotValidationIssue[] };

export function validatePcsAnalysisSnapshotV2(input: unknown): PcsSnapshotValidationResult {
  try {
    const value = input as Record<string, any>;
    const records = Array.isArray(value?.records) ? value.records : [];
    const recordIds = records.map((record: any) => record?.id);
    const values = records.flatMap((record: any) => Array.isArray(record?.values) ? record.values : []);
    const timezoneValid = (() => {
      try {
        if (typeof value?.period?.timezone !== "string") return false;
        new Intl.DateTimeFormat("en-US", { timeZone: value.period.timezone }).format();
        return true;
      } catch {
        return false;
      }
    })();
    if (Object.keys(value ?? {}).some((key) => !["schemaVersion", "contractRevision", "snapshotId", "profileId", "generatedAt", "period", "records", "excluded"].includes(key))) throw new Error("unknown_property");
    if (recordIds.some((id: unknown) => typeof id !== "string") || new Set(recordIds).size !== recordIds.length) throw new Error("duplicate_record_id");
    if (!timezoneValid || values.some((item: any) => item?.analysisRoleConfirmed !== true)) throw new Error("snapshot_confirmation_or_timezone_invalid");
    return { ok: true, value: validateContextAnalysisSnapshot(input) as PcsAnalysisSnapshotV2 };
  } catch (error) {
    return { ok: false, errors: [{ path: "$", message: error instanceof Error ? error.message : "invalid_snapshot" }] };
  }
}

export function assertValidPcsAnalysisSnapshotV2(input: unknown): PcsAnalysisSnapshotV2 {
  const result = validatePcsAnalysisSnapshotV2(input);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join("; "));
  return result.value;
}
