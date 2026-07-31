import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

type Migration = { id: string; apply: () => void };

const runtimeColumns: Array<[string, string, string]> = [
  ["hypotheses", "state", "TEXT NOT NULL DEFAULT 'tracking'"],
  ["entries", "source_updated_at", "TEXT"],
  ["entries", "template_version_id", "TEXT"],
  ["hypotheses", "spec_json", "TEXT"],
  ["hypotheses", "spec_version", "TEXT"],
  ["responses", "capture_mode", "TEXT NOT NULL DEFAULT 'momentary_observation'"],
  ["hypothesis_evaluations", "hypothesis_spec_version", "TEXT NOT NULL DEFAULT '1'"],
  ["hypothesis_evaluations", "evaluator_version", "TEXT NOT NULL DEFAULT 'comparison-v1'"],
  ["hypothesis_evaluations", "evaluated_at", "TEXT NOT NULL DEFAULT ''"],
  ["hypothesis_evaluations", "window_start", "TEXT NOT NULL DEFAULT ''"],
  ["hypothesis_evaluations", "window_end", "TEXT NOT NULL DEFAULT ''"],
  ["hypothesis_evaluations", "result", "TEXT NOT NULL DEFAULT 'inconclusive'"],
  ["hypothesis_evaluations", "cohort_metrics_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["hypothesis_evaluations", "observed_effect", "REAL"],
  ["hypothesis_evaluations", "required_effect", "REAL NOT NULL DEFAULT 0"],
  ["hypothesis_evaluations", "data_quality_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["entry_field_values", "source_content_hash", "TEXT"],
  ["entry_field_values", "source_updated_at", "TEXT"],
  ["entry_field_values", "confidence", "REAL"],
  ["entry_field_values", "source", "TEXT"],
  ["entry_field_values", "reviewed_at", "TEXT"],
  ["entry_field_values", "updated_at", "TEXT"],
  ["entry_template_fields", "sensitivity_level", "TEXT NOT NULL DEFAULT 'normal'"],
  ["entry_template_fields", "classification_source", "TEXT NOT NULL DEFAULT 'system_rule'"],
  ["entry_template_fields", "prohibited_secret_risk", "INTEGER NOT NULL DEFAULT 0"],
  ["entry_template_fields", "semantic_role", "TEXT"],
  ["entry_template_fields", "semantic_role_source", "TEXT"],
  ["entry_template_fields", "semantic_role_confidence", "REAL"],
  ["entry_template_fields", "semantic_role_confirmed", "INTEGER NOT NULL DEFAULT 0"],
  ["entry_template_fields", "semantic_merge_allowed", "INTEGER NOT NULL DEFAULT 0"],
  ["hypothesis_reviews", "analysis_start_at", "TEXT"],
  ["hypothesis_reviews", "analysis_end_at", "TEXT"],
  ["hypothesis_reviews", "template_version_id", "TEXT"],
  ["hypothesis_reviews", "field_pair_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["hypothesis_reviews", "reviewed_at", "TEXT"],
  ["self_model_candidates", "source_hypothesis_id", "TEXT"],
  ["self_model_candidates", "supporting_period_start", "TEXT"],
  ["self_model_candidates", "supporting_period_end", "TEXT"],
  ["self_model_candidates", "user_note", "TEXT NOT NULL DEFAULT ''"],
  ["self_model_candidates", "accepted_at", "TEXT"],
  ["self_model_candidates", "last_reviewed_at", "TEXT"],
  ["self_model_candidates", "construct_key", "TEXT"],
  ["self_model_candidates", "tendency_scope", "TEXT"],
  ["self_model_candidates", "source_analysis_periods_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["self_model_candidates", "supporting_field_pairs_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["self_model_candidates", "resolution_action", "TEXT NOT NULL DEFAULT 'new'"],
  ["self_model_candidates", "target_self_belief_id", "TEXT"],
  ["self_beliefs", "source_hypothesis_id", "TEXT"],
  ["self_beliefs", "status", "TEXT NOT NULL DEFAULT 'active'"],
  ["self_beliefs", "user_note", "TEXT NOT NULL DEFAULT ''"],
  ["self_beliefs", "accepted_at", "TEXT"],
  ["self_beliefs", "last_reviewed_at", "TEXT"],
  ["self_beliefs", "supporting_period_start", "TEXT"],
  ["self_beliefs", "supporting_period_end", "TEXT"],
  ["self_beliefs", "construct_key", "TEXT"],
  ["self_beliefs", "tendency_scope", "TEXT"],
  ["self_beliefs", "source_analysis_periods_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["self_beliefs", "supporting_field_pairs_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["self_understanding_analysis_history", "condition_template_id", "TEXT"],
  ["self_understanding_analysis_history", "condition_template_version_id", "TEXT"],
  ["self_understanding_analysis_history", "condition_field_key", "TEXT"],
  ["self_understanding_analysis_history", "condition_scale_fingerprint", "TEXT"],
  ["self_understanding_analysis_history", "outcome_template_id", "TEXT"],
  ["self_understanding_analysis_history", "outcome_template_version_id", "TEXT"],
  ["self_understanding_analysis_history", "outcome_field_key", "TEXT"],
  ["self_understanding_analysis_history", "outcome_scale_fingerprint", "TEXT"],
  ["self_understanding_analysis_history", "source_entry_ids_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["self_understanding_analysis_history", "source_entry_fingerprint", "TEXT NOT NULL DEFAULT ''"],
  ["self_understanding_analysis_history", "evidence_provenance_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["external_observations", "review_state", "TEXT NOT NULL DEFAULT 'imported'"],
  ["external_observations", "local_date", "TEXT"],
  ["external_observations", "source_bucket_id", "TEXT"],
  ["external_observations", "source_identity", "TEXT"]
];

export function migrateDatabase(db: DatabaseSync, root: string) {
  db.exec(readFileSync(resolve(root, "db", "ts_mvp_schema.sql"), "utf8"));
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT");
  const migrations: Migration[] = [
    {
      id: "runtime-columns-v1",
      apply: () => {
        for (const [table, column, definition] of runtimeColumns) {
          const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
          if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
        const entryColumns = db.prepare("PRAGMA table_info(entries)").all() as Array<{ name: string }>;
        if (entryColumns.some((column) => column.name === "source_modified_at")) db.exec("UPDATE entries SET source_updated_at=source_modified_at WHERE source_updated_at IS NULL");
      }
    },
    {
      id: "pcs-snapshot-v2",
      apply: () => {
        db.exec(`CREATE TABLE IF NOT EXISTS pcs_profile_bindings (
          metheory_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          pcs_profile_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT`);
        db.exec(`CREATE TABLE IF NOT EXISTS pcs_analysis_runs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          snapshot_id TEXT NOT NULL,
          profile_id TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          period_start_at TEXT NOT NULL,
          period_end_at TEXT NOT NULL,
          timezone TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          source_record_ids_json TEXT NOT NULL,
          source_fingerprint TEXT NOT NULL,
          contract_hash TEXT NOT NULL,
          result_summary_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(user_id, snapshot_id)
        ) STRICT`);
        db.exec("CREATE INDEX IF NOT EXISTS pcs_analysis_runs_user_time_idx ON pcs_analysis_runs(user_id, created_at DESC)");
        db.exec("CREATE INDEX IF NOT EXISTS pcs_analysis_runs_profile_time_idx ON pcs_analysis_runs(user_id, profile_id, period_start_at, period_end_at)");
      }
    },
    {
      id: "closed-loop-experiments-v1",
      apply: () => {
        db.exec(readFileSync(resolve(root, "db", "closed-loop-experiments-migration.sql"), "utf8"));
      }
    },
    {
      id: "experiment-observation-idempotency-v1",
      apply: () => {
        const columns = db.prepare("PRAGMA table_info(experiment_observations)").all() as Array<{ name: string }>;
        if (!columns.some((item) => item.name === "idempotency_key")) db.exec("ALTER TABLE experiment_observations ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT ''");
        db.exec("UPDATE experiment_observations SET idempotency_key=id WHERE idempotency_key='' OR idempotency_key IS NULL");
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS experiment_observations_idempotency_idx ON experiment_observations(experiment_id,idempotency_key)");
      }
    },
    {
      id: "experiment-integrity-v1",
      apply: () => {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS experiments_draft_unique ON experiments(draft_id)");
      }
    },
    {
      id: "self-model-revisions-v1",
      apply: () => {
        db.exec(`CREATE TABLE IF NOT EXISTS self_belief_revisions (
          id TEXT PRIMARY KEY, belief_id TEXT NOT NULL REFERENCES self_beliefs(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, source_candidate_id TEXT,
          source_hypothesis_id TEXT, source_experiment_id TEXT, previous_statement TEXT NOT NULL,
          proposed_statement TEXT NOT NULL, final_statement TEXT NOT NULL, previous_construct_key TEXT,
          final_construct_key TEXT, resolution_action TEXT NOT NULL CHECK(resolution_action IN ('new','update_existing','separate')),
          user_note TEXT NOT NULL DEFAULT '', approved_at TEXT NOT NULL, created_at TEXT NOT NULL
        ) STRICT`);
        db.exec("CREATE INDEX IF NOT EXISTS self_belief_revisions_lookup_idx ON self_belief_revisions(user_id,belief_id,created_at DESC)");
      }
    }
  ];
  for (const migration of migrations) {
    const exists = db.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(migration.id);
    if (exists) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.apply();
      db.prepare("INSERT INTO schema_migrations(id,applied_at) VALUES(?,?)").run(migration.id, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
