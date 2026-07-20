# Preference Mirror Deep Research Spec

This folder contains a versioned, implementation-oriented specification package for Preference Mirror.

Preference Mirror treats self-beliefs as hypotheses to test through lightweight EMA/ESM-style check-ins. AI is limited to structured transformation, hypothesis candidate generation, next-question suggestions, and safe explanation rendering. The product remains responsible for scheduling, validation, safety boundaries, persistence, and final decisions.

## Contents

- `docs/design-spec.md`: human-readable product and research design summary.
- `prompts/ai-templates.json`: versioned AI prompt templates with input and output schemas.
- `schemas/domain-schema.json`: minimal domain data schema for the MVP.
- `docs/notification-policy.md`: notification scheduling and UX constraints.
- `docs/mvp-metrics.md`: MVP scope and success indicators.
- `tools/validate_spec.py`: local validator for JSON syntax and required template/schema structure.
- `docs/technical-architecture.md`: accepted MVP stack, runtime flow, and module boundaries.
- `docs/privacy-retention.md`: retention, consent, erasure, and AI safety baseline.
- `docs/implementation-roadmap.md`: phased implementation and beta exit criteria.
- `db/postgresql_schema.sql`: PostgreSQL/pgvector baseline for the runtime data model.
- `backend/core.py`: dependency-free MVP domain and persistence layer.
- `backend/server.py`: local HTTP API for the first hypothesis update loop.
- `tools/test_mvp.py`: deterministic core tests.
- `docs/domain-language.md`: canonical domain vocabulary and state lifecycle.
- `docs/architecture-research.md`: architecture comparison, ADRs, API, AI, privacy, and migration plan.

## Validate

Run:

```powershell
python tools\validate_spec.py
```

JSON仕様をSQLiteへ移行する:

```powershell
python tools\migrate_json_to_sqlite.py
```

生成先は `data/preference_mirror.sqlite3`。移行元JSONはそのまま残し、DBは実行時に参照する正規化済みコピーとして扱う。

MVP APIを起動する:

```powershell
python -m backend.server
```

APIは `http://127.0.0.1:8000` で起動する。`GET /healthz`、ユーザー・Self Belief・仮説・check-in・回答・insightsの最小APIを含む。

MVPコアを検証する:

```powershell
python -m unittest tools.test_mvp -v
```
