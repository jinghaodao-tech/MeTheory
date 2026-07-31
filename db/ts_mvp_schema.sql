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
  source_hypothesis_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','questioned','archived')),
  user_note TEXT NOT NULL DEFAULT '',
  accepted_at TEXT,
  last_reviewed_at TEXT,
  supporting_period_start TEXT,
  supporting_period_end TEXT,
  construct_key TEXT,
  tendency_scope TEXT,
  source_analysis_periods_json TEXT NOT NULL DEFAULT '[]',
  supporting_field_pairs_json TEXT NOT NULL DEFAULT '[]',
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
  template_version_id TEXT,
  episode_id TEXT REFERENCES observation_episodes(id) ON DELETE SET NULL,
  external_source TEXT,
  external_source_id TEXT,
  source_updated_at TEXT,
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

CREATE TABLE IF NOT EXISTS hypothesis_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('fits','does_not_fit','on_hold')),
  note TEXT NOT NULL DEFAULT '',
  analysis_start_at TEXT,
  analysis_end_at TEXT,
  template_version_id TEXT,
  field_pair_json TEXT NOT NULL DEFAULT '{}',
  reviewed_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS hypothesis_reviews_user_candidate_idx ON hypothesis_reviews(user_id, candidate_id, created_at DESC);
CREATE TABLE IF NOT EXISTS self_understanding_analysis_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  construct_key TEXT NOT NULL,
  condition_role TEXT NOT NULL,
  outcome_role TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('a_greater_than_b','a_less_than_b','approximately_equal')),
  period_start_at TEXT NOT NULL,
  period_end_at TEXT NOT NULL,
  complete_pair_count INTEGER NOT NULL CHECK (complete_pair_count >= 0),
  condition_template_id TEXT,
  condition_template_version_id TEXT,
  condition_field_key TEXT,
  condition_scale_fingerprint TEXT,
  outcome_template_id TEXT,
  outcome_template_version_id TEXT,
  outcome_field_key TEXT,
  outcome_scale_fingerprint TEXT,
  source_entry_ids_json TEXT NOT NULL DEFAULT '[]',
  source_entry_fingerprint TEXT NOT NULL DEFAULT '',
  evidence_provenance_json TEXT NOT NULL DEFAULT '[]',
  candidate_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,candidate_id,period_start_at,period_end_at)
) STRICT;
CREATE INDEX IF NOT EXISTS self_understanding_history_lookup_idx
  ON self_understanding_analysis_history(
    user_id,
    construct_key,
    condition_role,
    outcome_role,
    period_start_at
  );
CREATE TABLE IF NOT EXISTS self_model_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected')),
  source_hypothesis_id TEXT,
  supporting_period_start TEXT,
  supporting_period_end TEXT,
  construct_key TEXT,
  tendency_scope TEXT,
  source_analysis_periods_json TEXT NOT NULL DEFAULT '[]',
  supporting_field_pairs_json TEXT NOT NULL DEFAULT '[]',
  resolution_action TEXT NOT NULL DEFAULT 'new' CHECK (resolution_action IN ('new','update_existing','separate')),
  target_self_belief_id TEXT REFERENCES self_beliefs(id) ON DELETE SET NULL,
  user_note TEXT NOT NULL DEFAULT '',
  accepted_at TEXT,
  last_reviewed_at TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS self_model_candidates_user_idx ON self_model_candidates(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS self_belief_revisions (
  id TEXT PRIMARY KEY,
  belief_id TEXT NOT NULL REFERENCES self_beliefs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_candidate_id TEXT,
  source_hypothesis_id TEXT,
  source_experiment_id TEXT,
  previous_statement TEXT NOT NULL,
  proposed_statement TEXT NOT NULL,
  final_statement TEXT NOT NULL,
  previous_construct_key TEXT,
  final_construct_key TEXT,
  resolution_action TEXT NOT NULL CHECK(resolution_action IN ('new','update_existing','separate')),
  user_note TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS self_belief_revisions_lookup_idx ON self_belief_revisions(user_id,belief_id,created_at DESC);

-- External observations are normalized before persistence. Raw ActivityWatch
-- payloads are intentionally not stored, so this table remains safe to reuse
-- in local analysis and can be rebuilt from the adapter when needed.
CREATE TABLE IF NOT EXISTS external_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN('activitywatch','manual_import','experiment')),
  source_bucket_id TEXT,
  source_event_id TEXT,
  source_identity TEXT,
  observed_at TEXT NOT NULL,
  local_date TEXT,
  duration_seconds REAL,
  semantic_role TEXT NOT NULL CHECK(semantic_role IN('observed_behavior','task_continuation','time_of_day','environment')),
  category TEXT NOT NULL CHECK(category IN('coding','writing','browser','communication','idle','other')),
  project_label TEXT,
  privacy_level TEXT NOT NULL CHECK(privacy_level IN('normal','sensitive')),
  imported_at TEXT NOT NULL,
  user_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(user_confirmed IN(0,1)),
  review_state TEXT NOT NULL DEFAULT 'imported' CHECK(review_state IN('imported','reviewed','excluded')),
  original_reference TEXT,
  transform_version TEXT NOT NULL DEFAULT 'activitywatch-v1'
) STRICT;
CREATE INDEX IF NOT EXISTS external_observations_user_time_idx ON external_observations(user_id, observed_at);
CREATE UNIQUE INDEX IF NOT EXISTS external_observations_fingerprint_idx ON external_observations(user_id, source, id);
CREATE UNIQUE INDEX IF NOT EXISTS external_observations_source_identity_idx ON external_observations(user_id, source, source_identity) WHERE source_identity IS NOT NULL;

CREATE TABLE IF NOT EXISTS baseline_self_perceptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source = 'baseline_self_perception'),
  item_set_version TEXT NOT NULL,
  item_key TEXT NOT NULL,
  original_item_reference TEXT,
  statement_ja TEXT NOT NULL,
  response INTEGER NOT NULL CHECK(response >= 1 AND response <= 5),
  response_minimum INTEGER NOT NULL DEFAULT 1,
  response_maximum INTEGER NOT NULL DEFAULT 5,
  recorded_at TEXT NOT NULL,
  user_confirmed INTEGER NOT NULL DEFAULT 1 CHECK(user_confirmed IN(0,1)),
  use_for_self_understanding INTEGER NOT NULL DEFAULT 1 CHECK(use_for_self_understanding IN(0,1)),
  privacy_level TEXT NOT NULL DEFAULT 'normal' CHECK(privacy_level = 'normal'),
  provenance_json TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  UNIQUE(user_id, item_set_version, item_key)
) STRICT;
CREATE INDEX IF NOT EXISTS baseline_self_perceptions_user_idx ON baseline_self_perceptions(user_id, deleted_at, recorded_at);

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

CREATE TABLE IF NOT EXISTS entry_templates (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, theme TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', current_version_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT) STRICT;
CREATE TABLE IF NOT EXISTS entry_template_versions (id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES entry_templates(id) ON DELETE CASCADE, version_number INTEGER NOT NULL, generation_source TEXT NOT NULL CHECK(generation_source IN ('ai','user')), ai_provider TEXT, ai_model TEXT, prompt_version TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(template_id,version_number)) STRICT;
CREATE TABLE IF NOT EXISTS entry_template_fields (id TEXT PRIMARY KEY, template_version_id TEXT NOT NULL REFERENCES entry_template_versions(id) ON DELETE CASCADE, field_key TEXT NOT NULL, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', input_type TEXT NOT NULL, value_type TEXT NOT NULL, required INTEGER NOT NULL CHECK(required IN(0,1)), display_order INTEGER NOT NULL, options_json TEXT NOT NULL DEFAULT '[]', minimum REAL, maximum REAL, unit TEXT, sensitivity TEXT NOT NULL CHECK(sensitivity IN('normal','sensitive')), reason TEXT NOT NULL, sensitivity_level TEXT NOT NULL DEFAULT 'normal' CHECK(sensitivity_level IN('normal','sensitive','highly_sensitive')), classification_source TEXT NOT NULL DEFAULT 'system_rule' CHECK(classification_source IN('ai_suggested','user_selected','system_rule')), prohibited_secret_risk INTEGER NOT NULL DEFAULT 0 CHECK(prohibited_secret_risk IN(0,1)), semantic_role TEXT CHECK(semantic_role IS NULL OR semantic_role IN('mood','energy','fatigue','recovery','sleep_duration','sleep_quality','time_of_day','day_type','social_context','social_intensity','environment','noise_level','task_clarity','deadline_clarity','start_delay','initiation_difficulty','continuation_difficulty','focus','completion','satisfaction','uncertainty','decision_count','avoidance','self_rating','observed_behavior','other')), semantic_role_source TEXT CHECK(semantic_role_source IS NULL OR semantic_role_source IN('user','template_rule','ai_suggestion','legacy_inference')), semantic_role_confidence REAL CHECK(semantic_role_confidence IS NULL OR (semantic_role_confidence >= 0 AND semantic_role_confidence <= 1)), semantic_role_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(semantic_role_confirmed IN(0,1)), semantic_merge_allowed INTEGER NOT NULL DEFAULT 0 CHECK(semantic_merge_allowed IN(0,1)), UNIQUE(template_version_id,field_key), UNIQUE(template_version_id,display_order)) STRICT;
CREATE TABLE IF NOT EXISTS entry_field_values (id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE, template_version_id TEXT NOT NULL REFERENCES entry_template_versions(id) ON DELETE RESTRICT, template_field_id TEXT NOT NULL REFERENCES entry_template_fields(id) ON DELETE RESTRICT, text_value TEXT, integer_value INTEGER, number_value REAL, boolean_value INTEGER, json_value TEXT, date_value TEXT, datetime_value TEXT, duration_seconds INTEGER, is_missing INTEGER NOT NULL DEFAULT 0 CHECK(is_missing IN(0,1)), source_content_hash TEXT, source_updated_at TEXT, confidence REAL, source TEXT, reviewed_at TEXT, updated_at TEXT, created_at TEXT NOT NULL, UNIQUE(entry_id,template_field_id)) STRICT;
CREATE INDEX IF NOT EXISTS entry_templates_user_idx ON entry_templates(user_id,archived_at,updated_at);
CREATE INDEX IF NOT EXISTS entry_template_versions_template_idx ON entry_template_versions(template_id,version_number);
CREATE INDEX IF NOT EXISTS entry_field_values_entry_idx ON entry_field_values(entry_id);
CREATE TRIGGER IF NOT EXISTS hypothesis_reviews_infer_template_version
AFTER INSERT ON hypothesis_reviews
WHEN NEW.template_version_id IS NULL
  AND NEW.analysis_start_at IS NOT NULL
  AND NEW.analysis_end_at IS NOT NULL
BEGIN
  UPDATE hypothesis_reviews
  SET template_version_id = (
    SELECT CASE
      WHEN COUNT(DISTINCT ev.template_version_id) = 1
      THEN MIN(ev.template_version_id)
      ELSE NULL
    END
    FROM entries e
    JOIN entry_field_values ev ON ev.entry_id = e.id
    JOIN entry_template_fields f ON f.id = ev.template_field_id
    WHERE e.user_id = NEW.user_id
      AND e.archived_at IS NULL
      AND e.recorded_at >= NEW.analysis_start_at
      AND e.recorded_at <= NEW.analysis_end_at
      AND (
        f.field_key = json_extract(NEW.field_pair_json, '$.condition')
        OR f.field_key = json_extract(NEW.field_pair_json, '$.outcome')
      )
  )
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS privacy_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  template_id TEXT,
  template_version_id TEXT,
  field_key TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK(consent_type IN('sensitive_field_processing','external_ai_transfer','highly_sensitive_downgrade')),
  provider_id TEXT,
  destination_fingerprint TEXT,
  scope TEXT NOT NULL CHECK(scope IN('field','single_value')),
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS privacy_consents_lookup_idx ON privacy_consents(user_id,template_id,template_version_id,field_key,consent_type,revoked_at);
CREATE TABLE IF NOT EXISTS privacy_audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT,
  event_type TEXT NOT NULL,
  data_category TEXT NOT NULL,
  affected_count INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS privacy_audit_events_user_idx ON privacy_audit_events(user_id,occurred_at);
CREATE TABLE IF NOT EXISTS privacy_value_overrides (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  template_version_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  original_level TEXT NOT NULL CHECK(original_level='highly_sensitive'),
  effective_level TEXT NOT NULL CHECK(effective_level='sensitive'),
  consent_id TEXT NOT NULL REFERENCES privacy_consents(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(entry_id,template_version_id,field_key)
) STRICT;
CREATE TABLE IF NOT EXISTS privacy_extraction_corrections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT,
  template_version_id TEXT,
  field_key TEXT NOT NULL,
  source_pattern TEXT NOT NULL,
  original_value_json TEXT NOT NULL,
  corrected_value_json TEXT NOT NULL,
  sensitivity_level TEXT NOT NULL CHECK(sensitivity_level IN('normal','sensitive','highly_sensitive')),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS privacy_safe_delete_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selector_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('planned','executed','expired','cancelled')),
  created_at TEXT NOT NULL,
  executed_at TEXT
) STRICT;

-- Closed-loop experiments are explicit records. Entries and PCS snapshots are
-- never copied into these tables unless a user or an experiment check-in adds
-- an observation deliberately.
CREATE TABLE IF NOT EXISTS experiment_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_candidate_id TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('draft','accepted','rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS experiment_drafts_user_idx ON experiment_drafts(user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES experiment_drafts(id) ON DELETE RESTRICT,
  source_candidate_id TEXT NOT NULL,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('condition_comparison','behavioral_intervention','observation_only')),
  comparison_type TEXT NOT NULL CHECK(comparison_type IN('condition_difference','before_after','with_without_intervention')),
  status TEXT NOT NULL CHECK(status IN('draft','ready','active','paused','completed','evaluated','archived','cancelled','insufficient_data','invalid')),
  started_at TEXT,
  ended_at TEXT,
  duration_days INTEGER NOT NULL CHECK(duration_days > 0),
  minimum_observations INTEGER NOT NULL CHECK(minimum_observations > 0),
  minimum_per_group INTEGER NOT NULL CHECK(minimum_per_group > 0),
  schedule_json TEXT NOT NULL,
  stop_conditions_json TEXT NOT NULL,
  safety_notes_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS experiments_draft_unique ON experiments(draft_id);
CREATE INDEX IF NOT EXISTS experiments_user_status_idx ON experiments(user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS experiment_conditions (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  parameter_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('condition','outcome','required','alternative_explanation')),
  config_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(experiment_id,parameter_id,role)
) STRICT;
CREATE TABLE IF NOT EXISTS experiment_required_parameters (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  parameter_id TEXT NOT NULL,
  minimum_samples INTEGER NOT NULL DEFAULT 1 CHECK(minimum_samples > 0),
  askable INTEGER NOT NULL DEFAULT 1 CHECK(askable IN(0,1)),
  priority INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY(experiment_id,parameter_id)
) STRICT;
CREATE TABLE IF NOT EXISTS experiment_schedules (
  experiment_id TEXT PRIMARY KEY REFERENCES experiments(id) ON DELETE CASCADE,
  schedule_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS experiment_stop_conditions (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  threshold REAL
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_observations (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES observation_episodes(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL DEFAULT '',
  observed_at TEXT NOT NULL,
  group_key TEXT NOT NULL,
  outcome REAL NOT NULL,
  condition_values_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK(source IN('checkin','manual','import')),
  eligible INTEGER NOT NULL DEFAULT 1 CHECK(eligible IN(0,1)),
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(experiment_id,episode_id)
) STRICT;
CREATE INDEX IF NOT EXISTS experiment_observations_lookup_idx ON experiment_observations(experiment_id,group_key,observed_at);
CREATE UNIQUE INDEX IF NOT EXISTS experiment_observations_idempotency_idx ON experiment_observations(experiment_id,idempotency_key);
CREATE TABLE IF NOT EXISTS experiment_adherence (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  observation_id TEXT REFERENCES experiment_observations(id) ON DELETE SET NULL,
  attempted INTEGER NOT NULL CHECK(attempted IN(0,1)),
  completed INTEGER NOT NULL CHECK(completed IN(0,1)),
  reason TEXT,
  burden_minutes REAL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_evaluations (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  evaluation_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('supported','challenged','mixed','inconclusive','insufficient_data','invalid')),
  evaluated_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS experiment_evaluations_lookup_idx ON experiment_evaluations(experiment_id,evaluated_at DESC);
CREATE TABLE IF NOT EXISTS experiment_hypothesis_links (
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK(relation IN('source','reassessment')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(experiment_id,hypothesis_id,relation)
) STRICT;

CREATE TABLE IF NOT EXISTS data_collection_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_analysis_id TEXT NOT NULL,
  target_construct TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('proposed','accepted','completed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS data_collection_shortages (
  plan_id TEXT NOT NULL REFERENCES data_collection_plans(id) ON DELETE CASCADE,
  parameter_id TEXT NOT NULL,
  needed INTEGER NOT NULL CHECK(needed > 0),
  reason TEXT NOT NULL,
  PRIMARY KEY(plan_id,parameter_id)
) STRICT;
CREATE INDEX IF NOT EXISTS data_collection_plans_user_idx ON data_collection_plans(user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS hypothesis_review_reasons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS hypothesis_timelines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS hypothesis_timelines_lookup_idx ON hypothesis_timelines(user_id,hypothesis_id,created_at);

CREATE TABLE IF NOT EXISTS self_model_freshness (
  belief_id TEXT PRIMARY KEY REFERENCES self_beliefs(id) ON DELETE CASCADE,
  evidence_scope TEXT NOT NULL CHECK(evidence_scope IN('emerging','state_dependent','relatively_stable')),
  accepted_at TEXT NOT NULL,
  last_reviewed_at TEXT NOT NULL,
  evidence_period_start TEXT NOT NULL,
  evidence_period_end TEXT NOT NULL,
  supporting_evidence_count INTEGER NOT NULL DEFAULT 0,
  contradicting_evidence_count INTEGER NOT NULL DEFAULT 0,
  linked_experiment_ids_json TEXT NOT NULL DEFAULT '[]',
  review_due_at TEXT,
  freshness_status TEXT NOT NULL CHECK(freshness_status IN('current','review_due','possibly_changed','unsupported_recently','retracted')),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS self_model_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  belief_id TEXT NOT NULL REFERENCES self_beliefs(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN('still_applies','context_dependent','not_recently','unknown','retract','revise')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS self_model_reviews_lookup_idx ON self_model_reviews(user_id,belief_id,created_at DESC);

-- Versioned PCS boundary and immutable analysis provenance.
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS pcs_profile_bindings (
  metheory_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pcs_profile_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS pcs_analysis_runs (
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
) STRICT;

CREATE INDEX IF NOT EXISTS pcs_analysis_runs_user_time_idx
  ON pcs_analysis_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pcs_analysis_runs_profile_time_idx
  ON pcs_analysis_runs(user_id, profile_id, period_start_at, period_end_at);
