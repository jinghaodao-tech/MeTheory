import {
  CONTEXT_ANALYSIS_SNAPSHOT_V2_VERSION,
  validateContextAnalysisSnapshot,
  type ContextAnalysisSnapshotV2
} from "personal-context-studio/integration-contracts";
import { analyzePcsAnalysisSnapshot, type PcsAnalysisResult } from "../../../../packages/self-understanding/src/pcsSnapshotAnalysis.ts";
import { validatePcsAnalysisSnapshotV3, type PcsAnalysisSnapshotV3 } from "../../../../packages/contracts/src/pcsAnalysisSnapshotV3.ts";

export type PcsBinding = { pcsProfileId: string } | null | undefined;
export type BoundPcsSnapshotValidation =
  | { ok: true; value: ContextAnalysisSnapshotV2 }
  | { ok: true; value: PcsAnalysisSnapshotV3 }
  | { ok: false; status: 409 | 422; error: "pcs_snapshot_invalid" | "pcs_profile_not_bound" | "pcs_profile_mismatch"; details?: unknown };

export function validateBoundPcsSnapshot(snapshot: unknown, binding: PcsBinding): BoundPcsSnapshotValidation {
  let validation: ContextAnalysisSnapshotV2 | PcsAnalysisSnapshotV3;
  try {
    if ((snapshot as any)?.schemaVersion === "pcs-analysis-snapshot-v3") validation = validatePcsAnalysisSnapshotV3(snapshot);
    else {
      const candidate = validateContextAnalysisSnapshot(snapshot);
      if (candidate.schemaVersion !== CONTEXT_ANALYSIS_SNAPSHOT_V2_VERSION) throw new Error("pcs_snapshot_version_unsupported");
      validation = candidate as ContextAnalysisSnapshotV2;
    }
  }
  catch (error) { return { ok: false, status: 422, error: "pcs_snapshot_invalid", details: String(error) }; }
  if (!binding) return { ok: false, status: 409, error: "pcs_profile_not_bound" };
  if (binding.pcsProfileId !== validation.profileId) return { ok: false, status: 409, error: "pcs_profile_mismatch" };
  return { ok: true, value: validation } as BoundPcsSnapshotValidation;
}

export function analyzeBoundPcsSnapshot(snapshot: ContextAnalysisSnapshotV2 | PcsAnalysisSnapshotV3, options: { minimumTotalSamples?: number; maximumCandidates?: number } = {}): PcsAnalysisResult {
  return analyzePcsAnalysisSnapshot(snapshot, options);
}
