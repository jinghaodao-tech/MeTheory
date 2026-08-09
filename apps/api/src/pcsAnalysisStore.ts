import type { DatabaseSync } from "node:sqlite";
import { PostgresPcsAnalysisRepository } from "./postgresPcsAnalysisRepository.ts";
import { SqlitePcsAnalysisRepository, type PcsAnalysisRun, type PcsProfileBinding } from "./pcsAnalysisRepository.ts";
import type { ContextAnalysisSnapshotV2 } from "personal-context-studio/integration-contracts";
import type { PcsAnalysisResult } from "../../../packages/self-understanding/src/pcsSnapshotAnalysis.ts";
import type { PcsAnalysisSnapshotV3 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV3.ts";

export interface PcsAnalysisStore {
  readonly driver: "sqlite" | "postgres";
  bind(userId: string, profileId: string): Promise<PcsProfileBinding>;
  getBinding(userId: string): Promise<PcsProfileBinding | undefined>;
  remove(userId: string): Promise<boolean>;
  saveRun(userId: string, snapshot: ContextAnalysisSnapshotV2 | PcsAnalysisSnapshotV3, result: PcsAnalysisResult): Promise<PcsAnalysisRun>;
  listRuns(userId: string, options?: { limit?: number; offset?: number }): Promise<{ items: PcsAnalysisRun[]; total: number }>;
  getRun(userId: string, runId: string): Promise<PcsAnalysisRun | undefined>;
  health(): Promise<boolean>;
}

class SqlitePcsAnalysisStore implements PcsAnalysisStore {
  readonly driver = "sqlite" as const;
  private readonly repository: SqlitePcsAnalysisRepository;
  constructor(db: DatabaseSync) { this.repository = new SqlitePcsAnalysisRepository(db); }
  async bind(userId: string, profileId: string) { return this.repository.bind(userId, profileId); }
  async getBinding(userId: string) { return this.repository.getBinding(userId); }
  async remove(userId: string) { return this.repository.remove(userId); }
  async saveRun(userId: string, snapshot: ContextAnalysisSnapshotV2 | PcsAnalysisSnapshotV3, result: PcsAnalysisResult) { return this.repository.saveRun(userId, snapshot, result); }
  async listRuns(userId: string, options?: { limit?: number; offset?: number }) { return this.repository.listRuns(userId, options); }
  async getRun(userId: string, runId: string) { return this.repository.getRun(userId, runId); }
  async health() { return true; }
}

export function createPcsAnalysisStore(db: DatabaseSync): PcsAnalysisStore {
  if (process.env.METHEORY_ANALYSIS_STORE === "postgres") {
    const connectionString = process.env.METHEORY_POSTGRES_URL;
    if (!connectionString) throw new Error("METHEORY_POSTGRES_URL is required when METHEORY_ANALYSIS_STORE=postgres");
    const repository = new PostgresPcsAnalysisRepository({ connectionString, max: Number(process.env.METHEORY_POSTGRES_POOL_MAX ?? 10) });
    const fallback = new SqlitePcsAnalysisStore(db);
    let consecutiveFailures = 0;
    let circuitOpenUntil = 0;
    const failureThreshold = Math.max(1, Number(process.env.METHEORY_POSTGRES_FAILURE_THRESHOLD ?? 3));
    const cooldownMs = Math.max(1000, Number(process.env.METHEORY_POSTGRES_COOLDOWN_MS ?? 30000));
    const withFallback = async <T>(operation: (store: PostgresPcsAnalysisRepository) => Promise<T>, local: () => Promise<T>) => {
      if (Date.now() < circuitOpenUntil) { console.warn(JSON.stringify({ event: "analysis_store_circuit_open", retryAfterMs: circuitOpenUntil - Date.now() })); return local(); }
      try { const result = await operation(repository); consecutiveFailures = 0; circuitOpenUntil = 0; return result; }
      catch (error) { consecutiveFailures += 1; if (consecutiveFailures >= failureThreshold) circuitOpenUntil = Date.now() + cooldownMs; console.warn(JSON.stringify({ event: "analysis_store_fallback", consecutiveFailures, circuitOpen: circuitOpenUntil > Date.now(), error: error instanceof Error ? error.message : "postgres_error" })); return local(); }
    };
    return { driver: "postgres", bind: (userId, profileId) => withFallback((store) => store.bind(userId, profileId), () => fallback.bind(userId, profileId)), getBinding: (userId) => withFallback((store) => store.getBinding(userId), () => fallback.getBinding(userId)), remove: (userId) => withFallback((store) => store.remove(userId), () => fallback.remove(userId)), saveRun: (userId, snapshot, result) => withFallback((store) => store.saveRun(userId, snapshot, result), () => fallback.saveRun(userId, snapshot, result)), listRuns: (userId, options) => withFallback((store) => store.listRuns(userId, options), () => fallback.listRuns(userId, options)), getRun: (userId, runId) => withFallback((store) => store.getRun(userId, runId), () => fallback.getRun(userId, runId)), health: () => repository.health().catch(() => false) };
  }
  return new SqlitePcsAnalysisStore(db);
}
