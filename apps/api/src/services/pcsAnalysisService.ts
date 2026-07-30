import {
  validatePcsAnalysisSnapshotV2,
  type PcsAnalysisSnapshotV2
} from "../../../../packages/contracts/src/pcsAnalysisSnapshotV2.ts";
import { analyzePcsAnalysisSnapshot, type PcsAnalysisResult } from "../../../../packages/self-understanding/src/pcsSnapshotAnalysis.ts";

export type PcsBinding = { pcsProfileId: string } | null | undefined;
export type BoundPcsSnapshotValidation =
  | { ok: true; value: PcsAnalysisSnapshotV2 }
  | { ok: false; status: 409 | 422; error: "pcs_snapshot_invalid" | "pcs_profile_not_bound" | "pcs_profile_mismatch"; details?: unknown };

export function validateBoundPcsSnapshot(snapshot: unknown, binding: PcsBinding): BoundPcsSnapshotValidation {
  const validation = validatePcsAnalysisSnapshotV2(snapshot);
  if (!validation.ok) return { ok: false, status: 422, error: "pcs_snapshot_invalid", details: validation.errors };
  if (!binding) return { ok: false, status: 409, error: "pcs_profile_not_bound" };
  if (binding.pcsProfileId !== validation.value.profileId) return { ok: false, status: 409, error: "pcs_profile_mismatch" };
  return { ok: true, value: validation.value };
}

export function analyzeBoundPcsSnapshot(snapshot: PcsAnalysisSnapshotV2, options: { minimumTotalSamples?: number; maximumCandidates?: number } = {}): PcsAnalysisResult {
  return analyzePcsAnalysisSnapshot(snapshot, options);
}