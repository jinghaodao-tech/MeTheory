# MeTheory

MeTheory is a local-first personal information foundation. It can keep free
form records, later structure selected information, and use the existing
deterministic hypothesis system when a user wants to test a self-belief.

The current product specification is [`docs/current-product-spec.md`](docs/current-product-spec.md).
It is the source of truth for the Node.js, SQLite, VS Code/Cursor, CLI, and
Obsidian-first implementation. Older documents are retained as historical
domain references or future architecture research and do not override it.

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
- `docs/integration-architecture.md`: Entry, Obsidian, experiments, and future search boundaries.
- `docs/technical-architecture.md`: module boundaries and runtime flow.
- `docs/privacy-retention.md`: retention, consent, erasure, and AI safety baseline.
- `docs/local-ai-phase3.md`: local AI providers, draft approval, extraction, and review boundaries.
- `docs/privacy-phase4.md`: field privacy classification, consent, safe deletion, and privacy audit behavior.
- `docs/implementation-roadmap.md`: phased implementation and beta criteria.
- `docs/current-product-spec.md`: current product scope, boundaries, and implementation status.
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
- `apps/obsidian-plugin/`: minimal local Obsidian Entry registration plugin.
- `packages/records/src/`: platform-neutral Entry types and validation.
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

## Free records and Obsidian

Phase 1 adds `entries` as the structured reference to free-form records.
Entries are deliberately separate from `observation_episodes` and
`parameter_values`: an Entry is a human-readable record, while an Observation
is a typed value used by an experiment. The mobile SQLite migration is
idempotent and adds the Entry table without removing existing data. Mobile JSON
exports include Entries.

For Obsidian, install `apps/obsidian-plugin` as a local plugin, configure the
local API URL, then run `Register current note as MeTheory Entry`. On first
use the plugin creates or reuses a local user and stores its ID in plugin
settings. The plugin stores only `metheory_entry_id` when it creates an Entry.
Re-registering the same note preserves the existing Entry's `recordedAt` and
updates `sourceUpdatedAt` from the Obsidian file modification time.

For a new note, `recordedAt` is selected in this order: an explicit
`recorded_at` frontmatter value, a `date` frontmatter value, a daily filename
in `YYYY-MM-DD` or `YYYY-MM-DD.md` form, then the file creation timestamp.
Existing Entries keep their stored `recordedAt`. Invalid explicit or
daily-file dates stop registration instead of silently becoming the current
time. The plugin source of truth is
`apps/obsidian-plugin/src/main.ts`; `main.js` is the generated, tracked
Obsidian artifact. Build it with `npm run build:obsidian`.

See `docs/integration-architecture.md` for the current architecture, API
surface, timestamp semantics, and the planned search boundary.

## Local record search

Entry text is indexed into the derived `search_documents` table when it is
saved. The local API provides `GET /v1/search?userId=...&q=...` and returns a
BM25-ranked list with source references, snippets, matched terms, and recorded
timestamps. Existing Entries can be indexed with
`POST /v1/search-documents/rebuild`, which transactionally removes all Entry
documents for that user and rebuilds only current, unarchived Entries. Its
response includes `{ sourceKind: "entry", deleted, indexed }`; `removed` is
also returned as a compatibility alias for callers that used the earlier
rebuild response. Search documents are not authoritative and can be rebuilt
from Entries; hypothesis, Evidence, and parameter-value search builders remain
future work.

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
npm run typecheck:root
npm run typecheck:mobile
npm run typecheck:obsidian
npm run typecheck
npm run build:obsidian
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

The implemented mobile flow is onboarding -> local Self Belief and tracking
hypothesis -> home -> candidate review/adoption -> dynamic check-in questions
-> deterministic evaluation -> Evidence -> user-reviewed Self Model. Candidate
cards are suggestions only; adopting one creates a normal tracking hypothesis.
Generated questions are attached to the check-in and their typed answers are
stored in `parameter_values` in the same response transaction. The existing
fixed activity check-in remains the fallback when no dynamic question is ready.

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
logs. It does not expose raw records or SQL. Without an external authentication
middleware, this API is development-only; set METHEORY_API_AUTH_MODE=production
and provide x-metheory-authenticated-user-id through a trusted gateway before
exposing it outside localhost. Self Model text is denied by default.

The Node AI routes now use `apps/api/src/aiQueryService.ts`. Its parameter list,
single-parameter response, and aggregate query read only EAV definitions,
`parameter_values`, policy rows, governance status, and per-user settings.
`observations` remains only for the legacy write/evaluation compatibility API.
The allowed `groupBy` values are `time_period`, `day_of_week`, `day_type`,
`activity_category`, and `is_alone`; arbitrary SQL or arbitrary fields are
rejected. `FixtureProviderBridge` and `CalendarAdapter` provide the testable
provider boundary. An Expo calendar SDK bridge is planned because the current
mobile MVP does not ship an external calendar permission integration.

Implementation status: local SQLite/EAV, deterministic candidate generation,
dynamic questions, aggregate AI policy checks, fixture adapters, notification
budgeting, privacy deletion, and verification are implemented. OpenAI network
calls, cloud sync, authentication middleware, Expo calendar permissions, and
store distribution are development-only or planned; they are not production
integrations.

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
## Entry Templates

Entry Templates provide reusable, user-approved structures for free records. AI generation returns an unsaved draft; the user must approve it before storage. Templates and immutable versions are stored in local SQLite, and each template Entry keeps the version used at creation. Typed field values are intentionally separate from `observations` and `parameter_values`, so free records do not silently enter hypothesis evaluation. See `docs/template-system.md`.

## Local AI and Review

Phase 3 adds local-only AI provider selection for Ollama, OpenAI-compatible
local endpoints, Mock, Manual external AI, and Disabled mode. The default is
Disabled. Local workspace configuration is stored in `.metheory/workspace.json`;
API keys are read only from the process environment and are not written to
notes, SQLite exports, or logs. Manual mode only copies a schema prompt and
accepts pasted JSON after the same domain validation used by generated output.

Template generation writes an unapproved draft to `templates/drafts`. It is
never saved as a reusable SQLite template until the user runs the approval
command. Entry structuring also writes a reviewable extraction record with a
source content hash and source update time. A changed note makes that result
stale, so it cannot be applied silently. Structured Entry values remain free
record metadata and are not implicitly converted into observations.
New notes created from the VS Code Start view are provisional: they are written
to `notes/inbox`, opened immediately, and marked `tracked: true` and
`auto_structure: true`. Template search and attachment continue in the
background. Once a template is attached, the watcher waits three seconds
after a save before structuring the tracked note. It retries once, records a
content hash, and rejects stale results. Ordinary notes without `tracked:
true` never call AI automatically. Manual CLI and VS Code structure commands
remain available.

Useful commands are `ai detect`, `ai status`, `ai start`, `ai stop`, `ai test`,
`template generate`, `template draft list`, `template draft show <id>`,
`template draft set-result <id> <json-file>`, `template draft approve <id>`, `entry structure <note.md>`, and
`entry extraction-list`. VS Code exposes the corresponding AI detection,
template, structure, and review commands. Automatic cloud calls are not part
of this phase; external AI prompts are copied for explicit user interaction.

## Privacy and Safe Delete

Phase 4 adds `normal`, `sensitive`, and `highly_sensitive` field policies.
Classification suggestions are advisory; the stored policy records the source
of the final user or system choice. Sensitive field values require field-level
consent before storage. External AI transfer requires separate consent for the
field and a hashed destination fingerprint; API keys and raw destination
secrets are never stored.

`privacy status`, `privacy consents list`, `privacy fields list`, and
`privacy safe-delete plan <selector-json>` expose the privacy state. Safe
delete always creates a plan with affected counts and an exact confirmation
string. Execution is user-scoped and transactional for SQLite values and
derived Entry search documents. Markdown files are reported for review and
are never modified automatically. Consent history and deletion audit events
contain metadata and counts only, not values or note bodies.

## Self-understanding vertical slice

`POST /v1/self-understanding/analyze` and the CLI command
`self-understanding analyze` aggregate reviewed Entry field values over a
selected period and return up to five deterministic, non-diagnostic
hypotheses. Each result includes the period, supporting and contradicting
Entry IDs, missing-data flags, confidence, a small next action, and a proposed
Self Model statement. Use `self-understanding review <candidate-id> fits`,
`does_not_fit`, or `on_hold` to record the user's judgment. A `fits` review
creates a proposed Self Model candidate; accepting it is a separate explicit
review action.
