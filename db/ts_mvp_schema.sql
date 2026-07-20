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
  status TEXT NOT NULL CHECK (status IN ('proposed', 'tracking', 'supported', 'challenged', 'inconclusive', 'archived')),
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
  missing_reason TEXT
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
