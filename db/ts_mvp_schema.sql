PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS self_beliefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('user', 'import', 'ai_structured')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  self_belief_id TEXT REFERENCES self_beliefs(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  statement TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'tracking' CHECK (state IN ('proposed', 'tracking', 'paused', 'archived')),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'tracking', 'supported', 'challenged', 'inconclusive', 'archived')),
  spec_json TEXT,
  spec_version TEXT,
  rule_version TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS hypothesis_required_observations (
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  PRIMARY KEY (hypothesis_id, field)
) STRICT;

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hypothesis_id TEXT REFERENCES hypotheses(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('random', 'hypothesis', 'follow_up', 'manual')),
  question_json TEXT NOT NULL,
  response_status TEXT NOT NULL DEFAULT 'pending' CHECK (response_status IN ('pending', 'answered', 'snoozed', 'skipped', 'expired')),
  scheduled_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  policy_version TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  checkin_id TEXT NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  client_created_at TEXT NOT NULL,
  server_received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  missing_reason TEXT,
  capture_mode TEXT NOT NULL CHECK (capture_mode IN ('momentary_observation', 'retrospective_entry'))
) STRICT;

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  certainty TEXT NOT NULL CHECK (certainty IN ('high', 'medium', 'low')),
  source TEXT NOT NULL CHECK (source IN ('user_confirmed', 'ai_inferred', 'system')),
  source_span TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS evidence_links (
  id TEXT PRIMARY KEY,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('supports', 'challenges', 'insufficient')),
  rule_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (hypothesis_id, observation_id, rule_version)
) STRICT;

CREATE TABLE IF NOT EXISTS hypothesis_evaluations (
  id TEXT PRIMARY KEY,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  hypothesis_spec_version TEXT NOT NULL DEFAULT '1',
  evaluator_version TEXT NOT NULL DEFAULT 'comparison-v1',
  evaluated_at TEXT NOT NULL DEFAULT '',
  window_start TEXT NOT NULL DEFAULT '',
  window_end TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT 'inconclusive' CHECK (result IN ('insufficient_data', 'supports', 'challenges', 'inconclusive')),
  cohort_metrics_json TEXT NOT NULL DEFAULT '[]',
  observed_effect REAL,
  required_effect REAL NOT NULL DEFAULT 0,
  data_quality_json TEXT NOT NULL DEFAULT '[]',
  rule_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('supported', 'challenged', 'inconclusive')),
  support_count INTEGER NOT NULL,
  challenge_count INTEGER NOT NULL,
  insufficient_count INTEGER NOT NULL,
  sample_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS observations_response_idx ON observations(response_id);
CREATE INDEX IF NOT EXISTS evidence_hypothesis_idx ON evidence_links(hypothesis_id, created_at);
CREATE INDEX IF NOT EXISTS evaluations_hypothesis_idx ON hypothesis_evaluations(hypothesis_id, created_at);

CREATE TABLE IF NOT EXISTS hypothesis_evaluation_samples (
  evaluation_id TEXT NOT NULL REFERENCES hypothesis_evaluations(id) ON DELETE CASCADE,
  response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  cohort_key TEXT,
  included INTEGER NOT NULL CHECK (included IN (0, 1)),
  outcome_json TEXT,
  exclusion_reason TEXT,
  PRIMARY KEY (evaluation_id, response_id)
) STRICT;

-- The AI read surface uses the EAV tables below. Legacy observations remain for
-- compatibility with the HTTP MVP, but are not the AI data source.
CREATE TABLE IF NOT EXISTS parameter_definitions (
  id TEXT PRIMARY KEY,
  name_ja TEXT NOT NULL,
  description_ja TEXT NOT NULL,
  value_type TEXT NOT NULL,
  minimum_value REAL,
  maximum_value REAL,
  unit TEXT,
  parameter_layer TEXT NOT NULL,
  temporal_type TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  definition_version TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE TABLE IF NOT EXISTS parameter_allowed_values (
  parameter_id TEXT NOT NULL REFERENCES parameter_definitions(id) ON DELETE CASCADE,
  value_key TEXT NOT NULL,
  label_ja TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (parameter_id, value_key)
) STRICT;
CREATE TABLE IF NOT EXISTS parameter_ai_access_policies (
  parameter_id TEXT PRIMARY KEY REFERENCES parameter_definitions(id) ON DELETE CASCADE,
  external_ai_allowed INTEGER NOT NULL DEFAULT 0,
  access_level TEXT NOT NULL DEFAULT 'none',
  individual_consent_required INTEGER NOT NULL DEFAULT 0,
  maximum_reference_days INTEGER
) STRICT;
CREATE TABLE IF NOT EXISTS user_parameter_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parameter_id TEXT NOT NULL REFERENCES parameter_definitions(id) ON DELETE CASCADE,
  collection_enabled INTEGER NOT NULL DEFAULT 0,
  cloud_sync_enabled INTEGER NOT NULL DEFAULT 0,
  external_ai_enabled INTEGER NOT NULL DEFAULT 0,
  raw_value_access_enabled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, parameter_id)
) STRICT;
CREATE TABLE IF NOT EXISTS parameter_governance (
  parameter_id TEXT PRIMARY KEY REFERENCES parameter_definitions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
) STRICT;
CREATE TABLE IF NOT EXISTS observation_episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS parameter_values (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES observation_episodes(id) ON DELETE CASCADE,
  parameter_id TEXT NOT NULL REFERENCES parameter_definitions(id) ON DELETE RESTRICT,
  boolean_value INTEGER,
  integer_value INTEGER,
  number_value REAL,
  text_value TEXT,
  datetime_value TEXT,
  json_value TEXT,
  observed_at TEXT NOT NULL,
  is_missing INTEGER NOT NULL DEFAULT 0,
  eligible_for_evaluation INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE INDEX IF NOT EXISTS parameter_values_user_time_idx ON parameter_values(parameter_id, observed_at);
CREATE INDEX IF NOT EXISTS observation_episodes_user_time_idx ON observation_episodes(user_id, observed_at);

-- Entries are human-readable records. They deliberately remain distinct from
-- observation episodes, which are typed values collected for experiments.
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT,
  episode_id TEXT REFERENCES observation_episodes(id) ON DELETE SET NULL,
  external_source TEXT,
  external_source_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK ((external_source IS NULL AND external_source_id IS NULL) OR (external_source IS NOT NULL AND external_source_id IS NOT NULL))
) STRICT;
CREATE INDEX IF NOT EXISTS entries_user_recorded_idx ON entries(user_id, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS entries_external_identity_idx ON entries(user_id, external_source, external_source_id) WHERE external_source IS NOT NULL AND external_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS search_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('entry', 'hypothesis', 'evidence', 'parameter_value')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  search_text TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  tokens_json TEXT NOT NULL,
  doc_length INTEGER NOT NULL CHECK (doc_length >= 0),
  recorded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, source_kind, source_id)
) STRICT;
CREATE INDEX IF NOT EXISTS search_documents_user_source_idx ON search_documents(user_id, source_kind, recorded_at DESC);
