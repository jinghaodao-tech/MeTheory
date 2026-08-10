import { validatePcsAnalysisSnapshotV2 } from "./pcsAnalysisSnapshotV2.ts";

export type PcsConfirmationMode = "user_confirmed" | "machine_measured";
export type PcsMeasurement = { definitionVersion: string; sourceTool: string; sourceToolVersion: string; measuredAt: string };
export type PcsAnalysisSnapshotV3 = {
  schemaVersion: "pcs-analysis-snapshot-v3";
  contractRevision: "pcs-analysis-snapshot-v3.0";
  snapshotId: string;
  profileId: string;
  generatedAt: string;
  period: { startAt: string; endAt: string; timezone: string };
  records: Array<{ id: string; recordedAt: string; title?: string; sourceDocumentId: string | null; values: Array<Record<string, unknown> & { confirmationMode: PcsConfirmationMode; measurement?: PcsMeasurement }> }>;
  excluded: Record<string, number>;
};

export function validatePcsAnalysisSnapshotV3(input: unknown): PcsAnalysisSnapshotV3 {
  const value = input as Record<string, any>;
  if (value?.schemaVersion !== "pcs-analysis-snapshot-v3" || value?.contractRevision !== "pcs-analysis-snapshot-v3.0") throw new Error("pcs_snapshot_v3_version_invalid");
  if (!Array.isArray(value.records)) throw new Error("pcs_snapshot_v3_records_invalid");
  for (const record of value.records) for (const item of record.values ?? []) {
    if (item.confirmationMode !== "user_confirmed" && item.confirmationMode !== "machine_measured") throw new Error("pcs_snapshot_v3_confirmation_mode_invalid");
    if (item.confirmationMode === "machine_measured") {
      const measurement = item.measurement;
      if (!measurement || typeof measurement.definitionVersion !== "string" || typeof measurement.sourceTool !== "string" || typeof measurement.sourceToolVersion !== "string" || typeof measurement.measuredAt !== "string" || Number.isNaN(Date.parse(measurement.measuredAt))) throw new Error("pcs_snapshot_v3_measurement_invalid");
    } else if (item.measurement !== undefined) throw new Error("pcs_snapshot_v3_measurement_forbidden");
  }
  const legacy = structuredClone(value);
  legacy.schemaVersion = "pcs-analysis-snapshot-v2";
  legacy.contractRevision = "pcs-analysis-snapshot-v2.1";
  for (const record of legacy.records) for (const item of record.values ?? []) {
    delete item.confirmationMode;
    delete item.measurement;
    if (item.provenance?.source === "system") item.provenance.source = "manual_import";
    item.provenance.userConfirmed = true;
  }
  validatePcsAnalysisSnapshotV2(legacy);
  return value as PcsAnalysisSnapshotV3;
}

export function mapPcsConfirmationSource(value: { confirmationMode: PcsConfirmationMode; provenance?: { source?: string } }) {
  return value.confirmationMode === "machine_measured" ? "system" : "user_confirmed";
}
