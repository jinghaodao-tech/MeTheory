CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_subject TEXT NOT NULL UNIQUE,
    locale TEXT NOT NULL DEFAULT 'ja-JP',
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    retention_tier TEXT NOT NULL DEFAULT 'short' CHECK (retention_tier IN ('short', 'standard', 'research_opt_in')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    push_token_enc BYTEA,
    push_enabled BOOLEAN NOT NULL DEFAULT false,
    app_version TEXT,
    last_seen_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ
);

CREATE TABLE self_beliefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text_raw TEXT,
    text_normalized TEXT,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('user', 'import', 'ai_structured')),
    active_flag BOOLEAN NOT NULL DEFAULT true,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hypotheses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    self_belief_id UUID REFERENCES self_beliefs(id) ON DELETE SET NULL,
    template_key TEXT NOT NULL,
    statement TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'supported', 'challenged', 'inconclusive', 'archived')),
    version INTEGER NOT NULL DEFAULT 1,
    rule_version TEXT,
    model_hint TEXT,
    tracked_from TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checkin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hypothesis_id UUID REFERENCES hypotheses(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('random', 'hypothesis', 'follow_up', 'manual')),
    scheduled_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    skip_reason TEXT,
    scheduler_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkin_event_id UUID NOT NULL REFERENCES checkin_events(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    client_created_at TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    energy NUMERIC,
    mood NUMERIC,
    stress NUMERIC,
    activity_type TEXT,
    started_now BOOLEAN,
    free_text TEXT,
    missing_reason TEXT
);

CREATE TABLE nlp_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL,
    model_provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    output_json JSONB NOT NULL,
    confidence NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hypothesis_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
    response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('supports', 'challenges', 'insufficient')),
    weight NUMERIC NOT NULL DEFAULT 1,
    rule_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (hypothesis_id, response_id, rule_version)
);

CREATE TABLE consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    locale TEXT NOT NULL,
    granted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX responses_checkin_event_idx ON responses(checkin_event_id);
CREATE INDEX evidence_links_hypothesis_idx ON evidence_links(hypothesis_id, created_at);
CREATE INDEX self_beliefs_embedding_idx ON self_beliefs USING hnsw (embedding vector_cosine_ops);
