import type { DatabaseSync } from "node:sqlite";
import { analyzePersonalContextSnapshot } from "../../../packages/self-understanding/src/personalContext.ts";

function fingerprint(ids: string[]) { return ids.slice().sort().join("|"); }

export class SqliteSelfUnderstandingRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  analyze(userId: string, snapshot: unknown, input: { startAt: string; endAt: string; minimumEntryCount?: number }) {
    const result = analyzePersonalContextSnapshot(snapshot, input) as any;
    const createdAt = new Date().toISOString();
    const save = this.db.prepare(`INSERT INTO self_understanding_analysis_history(
      id,user_id,candidate_id,construct_key,condition_role,outcome_role,relation,
      period_start_at,period_end_at,complete_pair_count,condition_template_id,
      condition_template_version_id,condition_field_key,condition_scale_fingerprint,
      outcome_template_id,outcome_template_version_id,outcome_field_key,
      outcome_scale_fingerprint,source_entry_ids_json,source_entry_fingerprint,
      evidence_provenance_json,candidate_snapshot_json,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,candidate_id,period_start_at,period_end_at) DO UPDATE SET
      candidate_snapshot_json=excluded.candidate_snapshot_json,
      source_entry_ids_json=excluded.source_entry_ids_json,
      source_entry_fingerprint=excluded.source_entry_fingerprint,
      evidence_provenance_json=excluded.evidence_provenance_json,
      complete_pair_count=excluded.complete_pair_count,
      created_at=excluded.created_at`);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const hypothesis of result.hypotheses ?? []) {
        const condition = hypothesis.interpretationInput.condition;
        const outcome = hypothesis.interpretationInput.outcome;
        const sourceIds = [...new Set([...(hypothesis.supportingEntryIds ?? []), ...(hypothesis.contradictingEntryIds ?? [])])].sort();
        save.run(
          `pcs_${userId}_${hypothesis.id}_${input.startAt}_${input.endAt}`,
          userId, hypothesis.id, hypothesis.construct, condition.semanticRole, outcome.semanticRole,
          hypothesis.candidate.relation, input.startAt, input.endAt, hypothesis.candidate.completePairCount,
          hypothesis.templateIds?.[0] ?? null, null, condition.fieldKey, null,
          hypothesis.templateIds?.[0] ?? null, null, outcome.fieldKey, null,
          JSON.stringify(sourceIds), fingerprint(sourceIds),
          JSON.stringify({ supporting: hypothesis.supportingEvidence, contradicting: hypothesis.contradictingEvidence, source: "personal_context_studio" }),
          JSON.stringify(hypothesis), createdAt
        );
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return result;
  }

  latestSnapshot(userId: string, candidateId: string) {
    const row = this.db.prepare("SELECT candidate_snapshot_json FROM self_understanding_analysis_history WHERE user_id=? AND candidate_id=? ORDER BY created_at DESC LIMIT 1").get(userId, candidateId) as { candidate_snapshot_json: string } | undefined;
    return row ? JSON.parse(row.candidate_snapshot_json) : null;
  }

  relatedSelfModelItems(userId: string, constructKey: string) {
    return this.db.prepare("SELECT id,statement,status,construct_key,created_at FROM self_beliefs WHERE user_id=? AND construct_key=? AND status!='archived' ORDER BY created_at DESC").all(userId, constructKey);
  }
}
