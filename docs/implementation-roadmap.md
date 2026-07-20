# Implementation Roadmap

## Phase 1: core MVP

- Event model, authentication, device registration, and offline sync.
- Random / Hypothesis / Follow-up check-in flows.
- Notification preferences, quiet hours, budget, snooze, skip, and expiry.
- Deterministic evidence aggregation and an Evidence UI.
- PostgreSQL migration and a local SQLite test fixture.

## Phase 2: constrained AI

- Self Belief structuring with redaction and JSON-schema validation.
- Hypothesis candidate generation with a maximum of three candidates.
- Next-question suggestion with allowed question types.
- Safe explanation rendering with explicit insufficiency states.
- Offline evaluation dataset and provider/model lineage.

## Phase 3: trust and operations

- Consent, retention tiers, export, and erasure propagation.
- OpenTelemetry traces, Sentry error reporting, and product analytics.
- Idempotency tests, notification receipt tests, and deterministic replay tests.
- Dockerized API/worker deployment and versioned database migrations.

## Phase 4: scale only when evidence requires it

- Reassess a dedicated workflow queue or vector database after usage data.
- Add additional AI providers behind the adapter, not in domain modules.
- Introduce aggregate privacy controls for cross-user research.

## Exit criteria for the first beta

- AI outage leaves check-in, response storage, and basic summaries functional.
- Replaying the same raw events and rule version produces the same summary.
- A user can inspect, export, and delete their stored data.
- Missing data is visible and does not count as evidence against a hypothesis.
