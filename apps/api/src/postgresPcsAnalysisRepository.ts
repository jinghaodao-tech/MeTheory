import { Pool, type PoolClient } from "pg";
import type { ContextAnalysisSnapshotV2 } from "personal-context-studio/integration-contracts";
import type { PcsAnalysisSnapshotV3 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV3.ts";
import type { PcsAnalysisResult } from "../../../packages/self-understanding/src/pcsSnapshotAnalysis.ts";
import { pcsSnapshotContractHash, pcsSourceFingerprint, type PcsAnalysisRun, type PcsProfileBinding, type PcsAnalysisResultSummary, PcsSnapshotContentMismatchError } from "./pcsAnalysisRepository.ts";

function resultSummaryFrom(result: PcsAnalysisResult): PcsAnalysisResultSummary {
  const evidence = new Map(result.candidateEvidence.map((item) => [item.candidateId, item]));
  return { status: result.status, dataQuality: result.dataQuality, practicalThresholds: result.practicalThresholds, excludedFields: result.excludedFields, candidateAudit: result.candidateAudit, robustness: result.robustness, candidateIds: result.hypotheses.map((item) => item.id), candidates: result.hypotheses.map((item) => { const itemEvidence = evidence.get(item.id); return { id: item.id, statement: item.statement, construct: item.construct, tendencyScope: item.tendencyScope, period: item.period, candidate: item.candidate, interpretationInput: item.interpretationInput, supportingPatternDayCount: itemEvidence?.supporting.length ?? 0, contradictingPatternDayCount: itemEvidence?.contradicting.length ?? 0 }; }) };
}

export type PostgresPcsAnalysisRepositoryConfig = { connectionString: string; max?: number };

/** PostgreSQL read/write adapter for analysis history. PCS records remain outside this database. */
export class PostgresPcsAnalysisRepository {
  readonly pool: Pool;
  constructor(config: PostgresPcsAnalysisRepositoryConfig) { this.pool = new Pool({ connectionString: config.connectionString, max: config.max }); }
  async health() { const result = await this.pool.query("SELECT 1 AS ok"); return result.rows[0]?.ok === 1; }
  async close() { await this.pool.end(); }
  async bind(userId: string, profileId: string): Promise<PcsProfileBinding> { const timestamp = new Date().toISOString(); await this.pool.query("INSERT INTO pcs_profile_bindings(metheory_user_id,pcs_profile_id,created_at,updated_at) VALUES($1,$2,$3,$3) ON CONFLICT(metheory_user_id) DO UPDATE SET pcs_profile_id=EXCLUDED.pcs_profile_id,updated_at=EXCLUDED.updated_at", [userId, profileId, timestamp]); return (await this.getBinding(userId))!; }
  async getBinding(userId: string): Promise<PcsProfileBinding | undefined> { const row = (await this.pool.query("SELECT metheory_user_id,pcs_profile_id,created_at,updated_at FROM pcs_profile_bindings WHERE metheory_user_id=$1", [userId])).rows[0]; return row ? { metheoryUserId: row.metheory_user_id, pcsProfileId: row.pcs_profile_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() } : undefined; }
  async remove(userId: string) { return (await this.pool.query("DELETE FROM pcs_profile_bindings WHERE metheory_user_id=$1", [userId])).rowCount === 1; }
  async saveRun(userId: string, snapshot: ContextAnalysisSnapshotV2 | PcsAnalysisSnapshotV3, result: PcsAnalysisResult): Promise<PcsAnalysisRun> {
    const fingerprint = pcsSourceFingerprint(snapshot); const existing = await this.getRunBySnapshot(userId, snapshot.snapshotId); const summary = resultSummaryFrom(result);
    if (existing) { if (existing.sourceFingerprint !== fingerprint) throw new PcsSnapshotContentMismatchError(); await this.pool.query("UPDATE pcs_analysis_runs SET result_summary=$1::jsonb WHERE user_id=$2 AND id=$3", [JSON.stringify(summary), userId, existing.id]); return { ...existing, resultSummary: summary }; }
    const run: PcsAnalysisRun = { id: `pcs_analysis_${crypto.randomUUID().replaceAll("-", "")}`, userId, snapshotId: snapshot.snapshotId, profileId: snapshot.profileId, generatedAt: snapshot.generatedAt, period: snapshot.period, schemaVersion: snapshot.schemaVersion, sourceRecordIds: snapshot.records.map((record) => record.id).sort(), sourceFingerprint: fingerprint, contractHash: pcsSnapshotContractHash(), resultSummary: summary, createdAt: new Date().toISOString() };
    await this.pool.query("INSERT INTO pcs_analysis_runs(id,user_id,snapshot_id,profile_id,generated_at,period_start_at,period_end_at,timezone,schema_version,source_record_ids,source_fingerprint,contract_hash,result_summary,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14)", [run.id, run.userId, run.snapshotId, run.profileId, run.generatedAt, run.period.startAt, run.period.endAt, run.period.timezone, run.schemaVersion, JSON.stringify(run.sourceRecordIds), run.sourceFingerprint, run.contractHash, JSON.stringify(summary), run.createdAt]);
    return run;
  }
  async getRunBySnapshot(userId: string, snapshotId: string) { const row = (await this.pool.query("SELECT * FROM pcs_analysis_runs WHERE user_id=$1 AND snapshot_id=$2", [userId, snapshotId])).rows[0]; return row ? this.toRun(row) : undefined; }
  async getRun(userId: string, runId: string) { const row = (await this.pool.query("SELECT * FROM pcs_analysis_runs WHERE user_id=$1 AND id=$2", [userId, runId])).rows[0]; return row ? this.toRun(row) : undefined; }
  async listRuns(userId: string, options: { limit?: number; offset?: number } = {}) { const limit = Math.min(Math.max(Math.floor(options.limit ?? 50), 1), 200); const offset = Math.max(Math.floor(options.offset ?? 0), 0); const total = Number((await this.pool.query("SELECT COUNT(*)::int AS count FROM pcs_analysis_runs WHERE user_id=$1", [userId])).rows[0]?.count ?? 0); const rows = (await this.pool.query("SELECT * FROM pcs_analysis_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [userId, limit, offset])).rows; return { items: rows.map((row) => this.toRun(row)), total }; }
  private toRun(row: Record<string, any>): PcsAnalysisRun { return { id: String(row.id), userId: String(row.user_id), snapshotId: String(row.snapshot_id), profileId: String(row.profile_id), generatedAt: new Date(row.generated_at).toISOString(), period: { startAt: new Date(row.period_start_at).toISOString(), endAt: new Date(row.period_end_at).toISOString(), timezone: String(row.timezone) }, schemaVersion: String(row.schema_version), sourceRecordIds: row.source_record_ids as string[], sourceFingerprint: String(row.source_fingerprint), contractHash: String(row.contract_hash), resultSummary: row.result_summary as PcsAnalysisResultSummary, createdAt: new Date(row.created_at).toISOString() }; }
}
