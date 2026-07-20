PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    auth_subject TEXT NOT NULL UNIQUE,
    locale TEXT NOT NULL,
    timezone TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS self_beliefs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    active_flag INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hypotheses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    self_belief_id TEXT REFERENCES self_beliefs(id) ON DELETE SET NULL,
    template_key TEXT NOT NULL,
    statement TEXT NOT NULL,
    status TEXT NOT NULL,
    rule_version TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkin_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hypothesis_id TEXT REFERENCES hypotheses(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    question_json TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    response_status TEXT NOT NULL DEFAULT 'pending',
    scheduler_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    checkin_id TEXT NOT NULL REFERENCES checkin_events(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    client_created_at TEXT NOT NULL,
    server_received_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    missing_reason TEXT
);

CREATE INDEX IF NOT EXISTS checkin_user_status_idx ON checkin_events(user_id, response_status);
CREATE INDEX IF NOT EXISTS hypothesis_user_status_idx ON hypotheses(user_id, status);
