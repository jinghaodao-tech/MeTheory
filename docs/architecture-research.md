# MeTheory Architecture Research

## Executive decision

Adopt **Architecture B-lite**: a TypeScript local-first mobile client with
SQLite as the primary user store, plus a small TypeScript modular-monolith API
for optional sync, export, and AI work. The MVP must work without the API or an
LLM. Remote services are an extension point, not the source of truth for basic
observation.

The current Python prototype remains a reference implementation while the
TypeScript core is migrated. Do not introduce PostgreSQL, Cloud Tasks, Redis,
Kafka, Kubernetes, a dedicated vector database, or microservices in the MVP.

## Repository audit

The repository already contains a coherent product specification, JSON prompt
templates, SQLite migration tooling, a PostgreSQL future-state schema, a small
Python HTTP server, and two deterministic tests. The implemented loop is:

`user -> self belief -> hypothesis -> check-in -> response -> insight`.

The following gaps are material:

| Finding | Risk | Decision |
| --- | --- | --- |
| Python stdlib server is not the documented FastAPI stack | Medium | Keep as temporary reference; migrate the core to TypeScript first |
| JSON/SQLite/Python use different hypothesis names | High | Use the canonical lifecycle in `docs/domain-language.md` |
| Response stores arbitrary `payload_json` | High | Retain raw payload, add normalized Observation and EvidenceLink tables |
| Evidence and evaluation are computed in one Store method | High | Extract deterministic evidence and evaluation modules |
| No auth, ownership checks, pagination, or request limits | High | Required before any shared or public deployment |
| Notification budget and quiet hours are not enforced in code | High | Implement policy as a pure function with explicit inputs |
| AI contracts lack a uniform closed-object rule | Medium | Add `additionalProperties: false` and provider-neutral adapter contracts |
| Only two tests exist | High | Add replay, missing-data, state-transition, policy, privacy, and API tests |

## Architecture comparison

| Criterion | A: TS local modular monolith | B: mobile offline-first | C: cloud sync |
| --- | --- | --- | --- |
| Product fit | High | **Highest** | High |
| Local-first/privacy | High | **Highest** | Medium |
| Notifications | Medium | **High** with local notifications | High |
| Solo implementation size | **Low** | Medium | High |
| Portfolio signal | High | **Highest** | Medium |
| Testability | **Highest** | High with sync tests | Medium |
| Offline behavior | High | **Highest** | Low/Medium |
| Operating cost | **Lowest** | Low | High |
| Future multi-device sync | Medium | High | **Highest** |
| Overengineering risk | Low | Medium | **Highest** |

### Why B-lite

MeTheory collects short-lived, sensitive observations and should remain useful
when connectivity is absent. Expo SQLite persists across app restarts, and
Expo Notifications supports scheduling, receiving, and responding to
notifications. These capabilities directly support local question bundles and
local check-ins. The server remains useful for backup, optional sync, and AI,
but a failed server cannot block the core loop.

### Rejected for MVP

- A is a good compatibility and test harness, but a desktop-first web client
  weakens the notification and offline story.
- C adds synchronization conflicts, authentication, hosted database cost, and
  retention/deletion propagation before product evidence justifies them.
- FastAPI/PostgreSQL/GCP remain valid v1 options, but the current portfolio
  scope does not need their operational surface.

## Layered modular monolith

```text
src/
  modules/
    self-beliefs/
    hypotheses/
    observations/
    evidence/
    self-model/
    adaptive-logging/
    recommendations/
    notifications/
    experiments/
    ai/
    privacy/
  shared/
    db/
    http/
  app/
```

Each module may contain `domain`, `application`, and `infrastructure` files.
Use Clean Architecture selectively: keep domain rules independent of SQLite,
HTTP, and LLM SDKs; do not create interfaces for every value object. Use
repositories only for aggregate roots and domain services for cross-aggregate
decisions such as Evidence evaluation and Adaptive Logging.

## Data design

Normalized source tables:

`users`, `self_beliefs`, `hypotheses`, `hypothesis_required_observations`,
`checkins`, `questions`, `responses`, `observations`, `evidence_links`,
`evaluation_history`, `self_models`, `model_revisions`, `recommendations`,
`notification_preferences`, `notifications`, `delivery_results`, `ai_requests`,
`ai_results`, `consent_records`, and `erasure_requests`.

Keep JSON only for external or versioned payloads: raw response metadata,
question options, AI input/output, provider error details, and export manifests.
Do not use JSON for hypothesis status, evidence direction, provenance, IDs,
timestamps, or fields used in filtering and aggregation.

## API shape

| Method | Path | Kind |
| --- | --- | --- |
| POST | `/v1/users` | resource creation |
| POST | `/v1/self-beliefs` | resource creation |
| POST | `/v1/hypotheses` | resource creation |
| GET | `/v1/hypotheses/:id` | resource read |
| POST | `/v1/checkins/next` | action, idempotent by client key |
| POST | `/v1/checkins/:id/responses` | append answer, idempotent by key |
| GET | `/v1/hypotheses/:id/evidence` | paginated evidence read |
| GET | `/v1/self-model/revisions` | revision read |
| POST | `/v1/data-exports` | export action |
| POST | `/v1/erasure-requests` | destructive action |
| POST | `/v1/ai/structuring` | optional AI action |

Every mutable user resource is authorized by user ownership. List endpoints
are cursor-paginated. Offline writes carry `client_id`, `client_created_at`,
and `idempotency_key`; server conflict resolution is append-only for responses
and explicit last-write-wins only for preferences.

## Adaptive Logging algorithm

```text
eligible = questions whose required fields are missing for tracked hypotheses
eligible = remove questions asked within the cooldown window
eligible = remove candidates outside allowed time ranges or inside quiet hours
eligible = apply daily/hourly notification budget

score(question) = information_gain_proxy
                 * hypothesis_priority
                 * novelty
                 - user_burden

if follow_up_due: choose follow_up
else if eligible hypothesis question exists: choose highest score
else: choose controlled random baseline question
```

The score is deterministic and stores `policy_version`, candidate scores, and
the chosen reason. AI-proposed questions must pass the same schema, burden,
sensitivity, cooldown, and required-field checks before entering the candidate
set. Snooze creates one delayed candidate; skip records missing data; expiry
does not create negative evidence.

## Evidence and evaluation

For each Hypothesis, group Observations by required field and comparison cell.
Create `supports`, `challenges`, or `insufficient` EvidenceLinks only when the
observation is sufficiently certain and not missing. Keep both directions and
the exact `rule_version`. With fewer than two usable observations, return
`inconclusive`. Otherwise compare support and challenge counts; ties and mixed
cells remain `inconclusive`. Always expose sample size, missing count, time
window, comparison cells, and possible confounders.

The evaluator is a pure function:

`evaluate(observations, hypothesis_template, rule_version) -> evaluation`.

That makes replay tests and rule-version migrations possible without replaying
LLM calls.

## AI boundary

```text
LLMAdapter
  request(schema_version, prompt_version, redacted_input)
  -> validated AIResult | safe fallback
```

The adapter must enforce timeout, retry budget, cost budget, input hashing,
provider/model lineage, JSON Schema validation, and `additionalProperties: false`.
AI output is always a candidate or explanation. It cannot write a user-confirmed
Observation, change Hypothesis status, or calculate evidence. RAG, embeddings,
agents, MCP, and a dedicated vector database are rejected for MVP: there is no
retrieval problem that justifies their privacy and operational cost yet.

## Test strategy and order

1. Domain tests: lifecycle transitions, missing data, evidence direction.
2. Repository tests: foreign keys, unique idempotency, migrations.
3. Replay tests: same events and rule version produce the same summary.
4. Policy tests: budget, quiet hours, cooldown, follow-up, shared questions.
5. API tests: ownership, validation, pagination, error shape.
6. Offline sync tests: retries, conflicts, ordering, duplicate writes.
7. Privacy tests: export, erasure propagation, redaction, log scrubbing.
8. AI contract and prompt regression tests using fixed fixtures.
9. E2E tests for the mobile check-in loop after the client exists.

Property-based tests are useful for policy invariants, especially “never exceed
budget” and “missing never challenges”. Concurrency tests should cover two
retries of the same idempotency key and two candidate selections in one window.

## Migration plan

1. Freeze canonical enums and add contract tests against JSON and SQLite.
2. Extract the Python evaluator and policy behavior into fixture-based tests.
3. Implement the TypeScript domain modules and run both implementations against
   the same fixtures.
4. Add normalized Observation/Evidence tables while preserving raw payloads.
5. Replace the stdlib HTTP server with Express only after API contract tests pass.
6. Add Expo client and local SQLite; keep the API optional for sync.
7. Add auth, export, erasure, and remote sync before external beta.

There is no broken-production window: dual-run the evaluator on fixtures, then
switch one use case at a time. Keep the Python prototype as a reference until
the TypeScript replay suite reaches parity.

## Roadmap and portfolio narrative

### MVP

Local registration, Self Belief, Hypothesis, adaptive questions, Response,
Observation, Evidence, provisional status, evidence inspection, export, and
delete. No hosted AI or multi-device sync required.

### v1

Expo notifications, offline sync, AI structuring, candidate hypotheses,
alternative explanations, Recommendation, Self Model revisions, and privacy
telemetry.

### v2

Multi-device sync, N-of-1 experiments, additional providers, stronger within-
person time-series analysis, and opt-in aggregate research.

The strongest portfolio points are: domain state modeling, deterministic
replayable evidence, adaptive data collection, AI responsibility boundaries,
offline conflict handling, privacy deletion, and tests that prove missing data
does not become negative evidence.

## Sources

- [Node.js SQLite API](https://nodejs.org/api/sqlite.html)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Express routing](https://expressjs.com/en/guide/routing.html)
