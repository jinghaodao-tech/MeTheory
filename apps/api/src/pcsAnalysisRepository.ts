import type { DatabaseSync } from "node:sqlite";
import { PCS_ANALYSIS_CONTRACT_REVISION, snapshotContentHash, type PcsAnalysisSnapshotV2 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV2.ts";

export class SqlitePcsAnalysisRepository {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }
  bind(userId: string, profileId: string) { const t = new Date().toISOString(); this.db.prepare("INSERT INTO pcs_profile_bindings(user_id,profile_id,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile_id=excluded.profile_id,updated_at=excluded.updated_at").run(userId, profileId, t, t); }
  binding(userId: string) { return this.db.prepare("SELECT profile_id AS profileId,created_at AS createdAt,updated_at AS updatedAt FROM pcs_profile_bindings WHERE user_id=?").get(userId); }
  removeBinding(userId: string) { return this.db.prepare("DELETE FROM pcs_profile_bindings WHERE user_id=?").run(userId); }
  save(userId: string, snapshot: PcsAnalysisSnapshotV2, maximumCandidates: number) {
    const contentHash = snapshotContentHash(snapshot); const existing = this.db.prepare("SELECT id,content_hash AS contentHash FROM pcs_analysis_runs WHERE user_id=? AND snapshot_id=?").get(userId, snapshot.snapshotId) as { id: string; contentHash: string } | undefined;
    if (existing && existing.contentHash !== contentHash) return { error: "snapshot_id_content_mismatch" as const };
    if (existing) return { id: existing.id, contentHash, reused: true, candidates: this.candidates(existing.id) };
    const id = `pcs_run_${crypto.randomUUID()}`; const candidates = snapshot.records.filter((record) => !record.excluded && record.analysisUsage !== "excluded").slice(0, maximumCandidates).map((record, index) => ({ id: `candidate_${index + 1}`, fieldKey: record.fieldKey, analysisRole: record.analysisRole, status: "pending", evidenceRecordIds: [record.recordId] }));
    this.db.prepare("INSERT INTO pcs_analysis_runs(id,user_id,snapshot_id,profile_id,content_hash,contract_revision,snapshot_json,candidates_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id, userId, snapshot.snapshotId, snapshot.profileId, contentHash, PCS_ANALYSIS_CONTRACT_REVISION, JSON.stringify(snapshot), JSON.stringify(candidates), new Date().toISOString());
    return { id, contentHash, reused: false, candidates };
  }
  candidates(runId: string) { const row = this.db.prepare("SELECT candidates_json FROM pcs_analysis_runs WHERE id=?").get(runId) as { candidates_json?: string } | undefined; try { return JSON.parse(row?.candidates_json ?? "[]") as unknown[]; } catch { return []; } }
  history(userId: string) { return this.db.prepare("SELECT id,snapshot_id AS snapshotId,profile_id AS profileId,content_hash AS contentHash,contract_revision AS contractRevision,created_at AS createdAt FROM pcs_analysis_runs WHERE user_id=? ORDER BY created_at DESC").all(userId); }
  run(userId: string, runId: string) { return this.db.prepare("SELECT id,snapshot_id AS snapshotId,profile_id AS profileId,content_hash AS contentHash,contract_revision AS contractRevision,snapshot_json AS snapshotJson,candidates_json AS candidatesJson,created_at AS createdAt FROM pcs_analysis_runs WHERE user_id=? AND id=?").get(userId, runId); }
}
