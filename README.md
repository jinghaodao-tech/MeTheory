# MeTheory

MeTheory is a local-first self-observation app. It turns self-beliefs into
testable hypotheses, collects lightweight observations, evaluates evidence
deterministically, and presents provisional self-model updates.

The product boundary is explicit: the user chooses the scope of collection,
the system chooses when and what to collect, and AI may only propose bounded
interpretations or candidates. AI never decides facts, evidence strength,
notification timing, hypothesis status, or Self Model updates.

## Contents

- `docs/design-spec.md`: core loop and safety position.
- `docs/domain-language.md`: canonical entities and hypothesis lifecycle.
- `docs/hypothesis-evaluation.md`: versioned comparison evaluation and audit model.
- `docs/collection-responsibility.md`: collection ownership and three-layer presentation model.
- `docs/architecture-research.md`: target architecture and migration plan.
- `docs/technical-architecture.md`: module boundaries and runtime flow.
- `docs/privacy-retention.md`: retention, consent, erasure, and AI safety baseline.
- `docs/implementation-roadmap.md`: phased implementation and beta criteria.
- `docs/notification-policy.md`: notification constraints and user controls.
- `prompts/ai-templates.json`: versioned AI templates.
- `schemas/domain-schema.json`: domain data contract.
- `db/mvp_schema.sql`: Python reference SQLite schema.
- `db/ts_mvp_schema.sql`: TypeScript runtime SQLite schema with Observation and Evidence.
- `packages/domain/src/index.ts`: TypeScript pure rules for evidence, transitions, notification policy, and AI candidate validation.
- `packages/domain/src/hypothesis/`: typed HypothesisSpec, episode construction, conditions, and deterministic evaluators.
 - `packages/contracts/src/index.ts`: shared TypeScript request contracts.
 - `docs/openapi-ai.yaml`: read-only AI HTTP contract.
 - `docs/mcp-tools.md`: read-only MCP tool boundary.
- `apps/api/src/server.ts`: TypeScript Node MVP API.
- `backend/core.py`: Python reference implementation kept during migration.

## Commands

Validate the JSON specification:

```powershell
python tools\validate_spec.py
```

Migrate the JSON specification catalog to `data/metheory-spec.sqlite3`:

```powershell
python tools\migrate_json_to_sqlite.py
```

The migration copies the old `data/preference_mirror.sqlite3` catalog to the
new name once, when the new catalog does not exist. The runtime application DB
is separate and uses `data/metheory.sqlite3`.

Run the TypeScript domain tests:

```powershell
npm.cmd test
```

Start the TypeScript MVP API:

```powershell
npm.cmd run dev:api
```

The API listens on `http://127.0.0.1:8100`.

Run the Python compatibility tests:

```powershell
python -m unittest tools.test_mvp -v
```

## Smartphone MVP

The MeTheory smartphone app lives at `apps/mobile`. It keeps Self Beliefs,
Hypotheses, Check-ins, Observations, evaluation history, and notification
settings in the device's `metheory.sqlite` database. Onboarding creates a
separate Self Belief and a `time_of_day_productivity` HypothesisSpec for
day-versus-night observations. The MVP selects one of two fixed templates;
the hypothesis evaluator uses completed rate only. Started rate may be shown
as reference information, but never affects Supported or Challenged.

The app chooses notification times inside the user's enabled window, quiet
periods, daily limit, and minimum interval. It reserves the day's eligible
notifications together with their Check-ins; this MVP tracks all scheduled
notifications as `hypothesis` Check-ins.

```powershell
npm install
npm run dev:mobile
npm run typecheck
npm run test:mobile
npm run verify
npm --workspace apps/mobile run build:preview
```

Expo Go can exercise onboarding, local SQLite, check-ins, deterministic
evaluation, Evidence, and Self Model. Notification permission and scheduled
delivery require a physical device; notification behavior can require an Expo
development build depending on the SDK and platform. API authentication,
cloud sync, and store distribution are outside this MVP. The local API has an
allowlisted, aggregate-only AI read surface; production authentication and
deployment remain separate concerns. To reset local
development data, remove the app's `metheory.sqlite` database from the Expo
SQLite storage and relaunch the app; production migration paths do not delete
existing data.

The mobile app now keeps a rolling thirty-day local notification schedule. The
Settings screen can share a JSON export or delete all local user data after
confirmation. Store builds use `apps/mobile/eas.json`; configure the EAS project
and platform credentials before running the production build or submit command.

## Parameter dictionary and dynamic questions

The mobile database uses an EAV model for observations. Parameters are
definition records rather than SQLite columns, so adding a parameter does not
require changing the table schema. `observation_episodes` groups one check-in
or activity, while `parameter_values` stores typed values and distinguishes
missing values from `false`.

Definitions are divided into `base`, `hypothesis_dependent`, and `sensitive`
layers. Source definitions, question metadata, AI access policy, and per-user
collection settings are separate records. A saved hypothesis creates parameter
requirements from its scope, cohorts, and outcome; missing askable parameters
can then produce deterministic questions at runtime. Questions are validated
against the parameter type and allowed values before being stored.

Legacy `observations` are migrated idempotently into the EAV tables by schema
migration 6. Existing tables remain available during the compatibility period.
The migration records its completion and uses deterministic IDs, so rerunning
startup does not duplicate values. See `docs/parameter-eav.md` for table
responsibilities, source adapters, AI access controls, and extension guidance.

Source Adapter implementations and the local AI read-only Snapshot boundary
are documented in `docs/source-adapters.md`. The initial providers are
`system_clock`, `test_fixture`, and `manual_import`; external OAuth/API
integrations remain out of scope.

Candidate discovery is local and deterministic. Recent typed parameter values
are grouped by boolean, choice, or numeric cohort rules, compared against
eligible outcome parameters, scored for effect and data quality, and stored in
`hypothesis_candidates`. A user may dismiss or adopt a candidate. Adoption
creates a tracking hypothesis and requirements; question targets are selected
from shortages and cooldown rules, then generated from parameter metadata.

## Completion engineering

Candidate evaluation uses non-overlapping numeric cohorts, explicit
positiveValues for binary and choice outcomes, and a first-half/second-half
temporal stability check. Discovery, validation, and replication remain
separate periods so discovery observations are not silently counted as
validation evidence.

Question selection applies daily, hourly, per-hypothesis, cooldown, quiet-hour,
and consecutive-skip budgets. A blocked budget returns a reason code instead
of creating a notification or question.

OpenAiProvider is optional. It receives structured input only, uses an
in-memory TTL cache, and returns usage metadata. API keys are runtime-only and
are never written to SQLite. Invalid output is rejected and can fall back to
the deterministic provider. The Node API exposes read-only /v1/ai routes with
an allowlisted client ID, user scoping, aggregate-only responses, and audit
logs. It does not expose raw records or SQL.

## Benchmark and verification

The verification suite includes domain, mobile, API acceptance, migration,
synthetic, OpenAPI contract, and benchmark smoke tests.

Commands: npm.cmd run verify, npm.cmd run benchmark:small,
npm.cmd run benchmark:medium, npm.cmd run benchmark:large, and
npm.cmd run benchmark.

SQLite benchmark results are written to the ignored artifacts directory and
include insert/query timings and EXPLAIN QUERY PLAN output. The large profile
uses 500,000 parameter_values; adjust the profile argument for a larger local
dataset.
