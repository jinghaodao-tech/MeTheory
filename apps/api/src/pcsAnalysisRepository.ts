import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { PCS_ANALYSIS_CONTRACT_REVISION, type ContextAnalysisSnapshotV2 } from "personal-context-studio/integration-contracts";
import type { PcsAnalysisResult } from "../../../packages/self-understanding/src/pcsSnapshotAnalysis.ts";
import type { PcsAnalysisSnapshotV3 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV3.ts";

export type PcsProfileBinding = {
  metheoryUserId: string;
  pcsProfileId: string;
  createdAt: string;
  updatedAt: string;
};

export type PcsAnalysisCandidateSummary = {
  id: string;
  statement: string;
  construct: string;
  tendencyScope: string;
  period: { startAt: string; endAt: string };
  candidate: PcsAnalysisResult["hypotheses"][number]["candidate"];
  interpretationInput: PcsAnalysisResult["hypotheses"][number]["interpretationInput"];
  supportingPatternDayCount: number;
  contradictingPatternDayCount: number;
};

export type PcsAnalysisResultSummary = {
  status: PcsAnalysisResult["status"];
  dataQuality: PcsAnalysisResult["dataQuality"];
  practicalThresholds: PcsAnalysisResult["practicalThresholds"];
  excludedFields: PcsAnalysisResult["excludedFields"];
  candidateAudit: PcsAnalysisResult["candidateAudit"];
  robustness: PcsAnalysisResult["robustness"];
  candidateIds: string[];
  candidates: PcsAnalysisCandidateSummary[];
};

export type PcsAnalysisRun = {
  id: string;
  userId: string;
  snapshotId: string;
  profileId: string;
  generatedAt: string;
  period: ContextAnalysisSnapshotV2["period"];
  schemaVersion: string;
  sourceRecordIds: string[];
  sourceFingerprint: string;
  contractHash: string;
  resultSummary?: PcsAnalysisResultSummary;
  createdAt: string;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
}

export function pcsSnapshotContractHash() {
  return hash(PCS_ANALYSIS_CONTRACT_REVISION);
}

export function pcsSourceFingerprint(snapshot: ContextAnalysisSnapshotV2 | PcsAnalysisSnapshotV3) {
  return hash(JSON.stringify(canonicalize(snapshot)));
}

export class PcsSnapshotContentMismatchError extends Error {
  constructor() {
    super("snapshot_id_content_mismatch");
    this.name = "PcsSnapshotContentMismatchError";
  }
}

function resultSummaryFrom(result: PcsAnalysisResult): PcsAnalysisResultSummary {
  const candidateEvidence = new Map(result.candidateEvidence.map((item) => [item.candidateId, item]));
  return {
    status: result.status,
    dataQuality: result.dataQuality,
    practicalThresholds: result.practicalThresholds,
    excludedFields: result.excludedFields,
    candidateAudit: result.candidateAudit,
    robustness: result.robustness,
    candidateIds: result.hypotheses.map((item) => item.id),
    candidates: result.hypotheses.map((item) => {
      const evidence = candidateEvidence.get(item.id);
      return {
        id: item.id,
        statement: item.statement,
        construct: item.construct,
        tendencyScope: item.tendencyScope,
        period: item.period,
        candidate: item.candidate,
        interpretationInput: item.interpretationInput,
        supportingPatternDayCount: evidence?.supporting.length ?? 0,
        contradictingPatternDayCount: evidence?.contradicting.length ?? 0
      };
    })
  };
}
export class SqlitePcsAnalysisRepository {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  bind(userId: string, pcsProfileId: string) {
    const timestamp = new Date().toISOString();
    this.db.prepare("INSERT INTO pcs_profile_bindings(metheory_user_id,pcs_profile_id,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(metheory_user_id) DO UPDATE SET pcs_profile_id=excluded.pcs_profile_id,updated_at=excluded.updated_at").run(userId, pcsProfileId, timestamp, timestamp);
    return this.getBinding(userId)!;
  }

  getBinding(userId: string): PcsProfileBinding | undefined {
    const row = this.db.prepare("SELECT metheory_user_id,pcs_profile_id,created_at,updated_at FROM pcs_profile_bindings WHERE metheory_user_id=?").get(userId) as { metheory_user_id: string; pcs_profile_id: string; created_at: string; updated_at: string } | undefined;
    return row ? { metheoryUserId: row.metheory_user_id, pcsProfileId: row.pcs_profile_id, createdAt: row.created_at, updatedAt: row.updated_at } : undefined;
  }

  remove(userId: string) {
    return Number(this.db.prepare("DELETE FROM pcs_profile_bindings WHERE metheory_user_id=?").run(userId).changes ?? 0) > 0;
  }

  saveRun(userId: string, snapshot: ContextAnalysisSnapshotV2 | PcsAnalysisSnapshotV3, result: PcsAnalysisResult): PcsAnalysisRun {
    const typedSnapshot = snapshot;
    const existing = this.getRunBySnapshot(userId, typedSnapshot.snapshotId);
    const resultSummary = resultSummaryFrom(result);
    if (existing) {
      if (existing.sourceFingerprint !== pcsSourceFingerprint(typedSnapshot)) throw new PcsSnapshotContentMismatchError();
      if (!existing.resultSummary || !Array.isArray(existing.resultSummary.candidates)) {
        this.db.prepare("UPDATE pcs_analysis_runs SET result_summary_json=? WHERE user_id=? AND id=?").run(JSON.stringify(resultSummary), userId, existing.id);
        existing.resultSummary = resultSummary;
      }
      return existing;
    }
    const run: PcsAnalysisRun = {
      id: `pcs_analysis_${randomUUID().replaceAll("-", "")}`,
      userId,
      snapshotId: typedSnapshot.snapshotId,
      profileId: typedSnapshot.profileId,
      generatedAt: typedSnapshot.generatedAt,
      period: typedSnapshot.period,
      schemaVersion: typedSnapshot.schemaVersion,
      sourceRecordIds: typedSnapshot.records.map((record) => record.id).sort(),
      sourceFingerprint: pcsSourceFingerprint(typedSnapshot),
      contractHash: pcsSnapshotContractHash(),
      createdAt: new Date().toISOString()
    };
    const candidateEvidence = new Map(result.candidateEvidence.map((item) => [item.candidateId, item]));
    run.resultSummary = resultSummary;
    this.db.prepare("INSERT INTO pcs_analysis_runs(id,user_id,snapshot_id,profile_id,generated_at,period_start_at,period_end_at,timezone,schema_version,source_record_ids_json,source_fingerprint,contract_hash,result_summary_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(run.id, run.userId, run.snapshotId, run.profileId, run.generatedAt, run.period.startAt, run.period.endAt, run.period.timezone, run.schemaVersion, JSON.stringify(run.sourceRecordIds), run.sourceFingerprint, run.contractHash, JSON.stringify(resultSummary), run.createdAt);
    return run;
  }

  getRunBySnapshot(userId: string, snapshotId: string): PcsAnalysisRun | undefined {
    const row = this.db.prepare("SELECT * FROM pcs_analysis_runs WHERE user_id=? AND snapshot_id=?").get(userId, snapshotId) as Record<string, unknown> | undefined;
    return row ? this.toRun(row) : undefined;
  }

  getRun(userId: string, runId: string): PcsAnalysisRun | undefined {
    const row = this.db.prepare("SELECT * FROM pcs_analysis_runs WHERE user_id=? AND id=?").get(userId, runId) as Record<string, unknown> | undefined;
    return row ? this.toRun(row) : undefined;
  }

  listRuns(userId: string, options: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(Math.floor(options.limit ?? 50), 1), 200);
    const offset = Math.max(Math.floor(options.offset ?? 0), 0);
    const total = Number((this.db.prepare("SELECT COUNT(*) AS count FROM pcs_analysis_runs WHERE user_id=?").get(userId) as { count: number }).count);
    const items = (this.db.prepare("SELECT * FROM pcs_analysis_runs WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(userId, limit, offset) as Record<string, unknown>[]).map((row) => this.toRun(row));
    return { items, total };
  }

  private toRun(row: Record<string, unknown>): PcsAnalysisRun {
    let resultSummary: PcsAnalysisResultSummary | undefined;
    if (typeof row.result_summary_json === "string") {
      try { resultSummary = JSON.parse(row.result_summary_json) as PcsAnalysisResultSummary; } catch { resultSummary = undefined; }
    }
    return {
      id: String(row.id),
      userId: String(row.user_id),
      snapshotId: String(row.snapshot_id),
      profileId: String(row.profile_id),
      generatedAt: String(row.generated_at),
      period: { startAt: String(row.period_start_at), endAt: String(row.period_end_at), timezone: String(row.timezone) },
      schemaVersion: String(row.schema_version),
      sourceRecordIds: JSON.parse(String(row.source_record_ids_json)) as string[],
      sourceFingerprint: String(row.source_fingerprint),
      contractHash: String(row.contract_hash),
      resultSummary,
      createdAt: String(row.created_at)
    };
  }
}
