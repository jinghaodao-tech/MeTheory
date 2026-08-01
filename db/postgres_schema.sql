CREATE TABLE IF NOT EXISTS pcs_profile_bindings (
  metheory_user_id TEXT PRIMARY KEY,
  pcs_profile_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pcs_analysis_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  period_start_at TIMESTAMPTZ NOT NULL,
  period_end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_fingerprint TEXT NOT NULL,
  contract_hash TEXT NOT NULL,
  result_summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS pcs_analysis_runs_user_created_idx ON pcs_analysis_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pcs_analysis_runs_source_idx ON pcs_analysis_runs(source_fingerprint);
