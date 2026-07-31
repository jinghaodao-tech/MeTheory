import type { PcsAnalysisSnapshotV2 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV2.ts";
import { validatePcsAnalysisSnapshotV2 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV2.ts";
import { SqlitePcsAnalysisRepository } from "./pcsAnalysisRepository.ts";

export type PcsAnalyzeResult =
  | { ok: true; runId: string; snapshotId: string; contentHash: string; candidates: unknown[]; reused: boolean }
  | { ok: false; error: string; status: number };

/** Application service: validation, binding policy, and persistence stay out of HTTP routes. */
export class PcsAnalysisService {
  private readonly repository: SqlitePcsAnalysisRepository;
  constructor(repository: SqlitePcsAnalysisRepository) { this.repository = repository; }

  analyze(userId: string, snapshotInput: unknown, maximumCandidates: unknown): PcsAnalyzeResult {
    const validated = validatePcsAnalysisSnapshotV2(snapshotInput);
    if (!validated.ok) return { ok: false, error: validated.error, status: 400 };
    return this.saveValidated(userId, validated.snapshot, maximumCandidates);
  }

  saveValidated(userId: string, snapshot: PcsAnalysisSnapshotV2, maximumCandidates: unknown): PcsAnalyzeResult {
    const bound = this.repository.binding(userId) as { profileId?: string } | undefined;
    if (bound?.profileId && bound.profileId !== snapshot.profileId) return { ok: false, error: "pcs_profile_mismatch", status: 409 };
    const saved = this.repository.save(userId, snapshot, Math.max(1, Math.min(5, Number(maximumCandidates) || 5)));
    if ("error" in saved) return { ok: false, error: String(saved.error), status: 409 };
    return { ok: true, runId: saved.id, snapshotId: snapshot.snapshotId, contentHash: saved.contentHash, candidates: saved.candidates, reused: saved.reused };
  }
}
