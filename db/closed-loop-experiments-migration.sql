-- MeTheory closed-loop experiment migration.
-- Safe to run repeatedly. The API bootstrap embeds the same CREATE IF NOT EXISTS
-- statements in db/ts_mvp_schema.sql.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS experiment_drafts (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_candidate_id TEXT NOT NULL,draft_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('draft','accepted','rejected')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiments (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,draft_id TEXT NOT NULL,source_candidate_id TEXT NOT NULL,title TEXT NOT NULL,statement TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('condition_comparison','behavioral_intervention','observation_only')),comparison_type TEXT NOT NULL CHECK(comparison_type IN('condition_difference','before_after','with_without_intervention')),status TEXT NOT NULL CHECK(status IN('draft','ready','active','paused','completed','evaluated','archived','cancelled','insufficient_data','invalid')),started_at TEXT,ended_at TEXT,duration_days INTEGER NOT NULL,minimum_observations INTEGER NOT NULL,minimum_per_group INTEGER NOT NULL,schedule_json TEXT NOT NULL,stop_conditions_json TEXT NOT NULL,safety_notes_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiment_conditions (experiment_id TEXT NOT NULL,parameter_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('condition','outcome','required','alternative_explanation')),config_json TEXT NOT NULL DEFAULT '{}',PRIMARY KEY(experiment_id,parameter_id,role));
CREATE TABLE IF NOT EXISTS experiment_required_parameters (experiment_id TEXT NOT NULL,parameter_id TEXT NOT NULL,minimum_samples INTEGER NOT NULL DEFAULT 1,askable INTEGER NOT NULL DEFAULT 1,priority INTEGER NOT NULL DEFAULT 100,PRIMARY KEY(experiment_id,parameter_id));
CREATE TABLE IF NOT EXISTS experiment_schedules (experiment_id TEXT PRIMARY KEY,schedule_json TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiment_stop_conditions (id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL,kind TEXT NOT NULL,description TEXT NOT NULL,threshold REAL);
CREATE TABLE IF NOT EXISTS experiment_observations (id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL,episode_id TEXT,observed_at TEXT NOT NULL,group_key TEXT NOT NULL,outcome REAL NOT NULL,condition_values_json TEXT NOT NULL DEFAULT '{}',source TEXT NOT NULL CHECK(source IN('checkin','manual','import')),eligible INTEGER NOT NULL DEFAULT 1,note TEXT,created_at TEXT NOT NULL,UNIQUE(experiment_id,episode_id));
CREATE TABLE IF NOT EXISTS experiment_adherence (id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL,observation_id TEXT,attempted INTEGER NOT NULL,completed INTEGER NOT NULL,reason TEXT,burden_minutes REAL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiment_evaluations (id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL,evaluation_json TEXT NOT NULL,status TEXT NOT NULL,evaluated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS experiment_hypothesis_links (experiment_id TEXT NOT NULL,hypothesis_id TEXT NOT NULL,relation TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(experiment_id,hypothesis_id,relation));
CREATE TABLE IF NOT EXISTS data_collection_plans (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_analysis_id TEXT NOT NULL,target_construct TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('proposed','accepted','completed','cancelled')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS data_collection_shortages (plan_id TEXT NOT NULL,parameter_id TEXT NOT NULL,needed INTEGER NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(plan_id,parameter_id));
CREATE TABLE IF NOT EXISTS hypothesis_review_reasons (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,candidate_id TEXT NOT NULL,reason TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',action TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hypothesis_timelines (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,hypothesis_id TEXT NOT NULL,event_type TEXT NOT NULL,source_id TEXT,payload_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS self_model_freshness (belief_id TEXT PRIMARY KEY,evidence_scope TEXT NOT NULL,accepted_at TEXT NOT NULL,last_reviewed_at TEXT NOT NULL,evidence_period_start TEXT NOT NULL,evidence_period_end TEXT NOT NULL,supporting_evidence_count INTEGER NOT NULL DEFAULT 0,contradicting_evidence_count INTEGER NOT NULL DEFAULT 0,linked_experiment_ids_json TEXT NOT NULL DEFAULT '[]',review_due_at TEXT,freshness_status TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS self_model_reviews (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,belief_id TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS experiments_user_status_idx ON experiments(user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS experiment_observations_lookup_idx ON experiment_observations(experiment_id,group_key,observed_at);
CREATE INDEX IF NOT EXISTS experiment_evaluations_lookup_idx ON experiment_evaluations(experiment_id,evaluated_at DESC);
CREATE INDEX IF NOT EXISTS data_collection_plans_user_idx ON data_collection_plans(user_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS hypothesis_timelines_lookup_idx ON hypothesis_timelines(user_id,hypothesis_id,created_at);
CREATE INDEX IF NOT EXISTS self_model_reviews_lookup_idx ON self_model_reviews(user_id,belief_id,created_at DESC);
