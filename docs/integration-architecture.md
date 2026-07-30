# MeTheory Integration Architecture

## Product boundary

MeTheory is the analysis and experiment component of a local-first personal
information foundation. Personal Context Studio owns recording, search, and
reviewed structuring. MeTheory validates a hypothesis when useful and lets the
user deliberately adopt a statement into a personal model.

| Boundary | Current responsibility |
| --- | --- |
| Personal Context Studio Markdown folder | Human-readable notes and editing in any editor |
| `entries` | Structured reference to a note, source identity, timestamps, and lifecycle |
| `observation_episodes` / `parameter_values` | Typed values collected for experiments |
| Hypotheses, Evidence, Self Model | Deterministic evaluation and user-reviewed interpretation |
| `search_documents` | Derived and replaceable search index, never a source of truth |

An Entry is never converted into an Observation implicitly. A future template
or structuring action may create parameter values only after an explicit user
action and domain validation.

## Implemented foundation

`entries` exists in both runtime SQLite schemas. The mobile database applies
the table as migration 11 and adds `source_updated_at` through migration 14.
The Node API applies the idempotent runtime schema on startup and also adds
the column to a database created by an earlier runtime. If an intermediate
development schema contains `source_modified_at`, its values are copied into
the new column without deleting the old column. Both schemas retain all
existing experiment tables and add no destructive migration.

The Entry repository lives behind two platform adapters:

* `packages/records/src/entries.ts` owns platform-neutral Entry types and input
  validation.
* `apps/api/src/entryRepository.ts` owns Node SQLite access for analysis references.
* `apps/mobile/src/storage/repositories/entryRepository.ts` owns Expo SQLite
  access and is exported through the existing mobile repository facade.

An Entry has a user-scoped, optional `(external_source, external_source_id)`
identity. The database indexes the pair uniquely when it exists. New
free-record registration and source identity belong to Personal Context
Studio; MeTheory retains this repository for analysis references.

`recordedAt` and `sourceUpdatedAt` have separate meanings. `recordedAt` is
the Entry's occurrence time and never changes during an upsert. A new Entry
uses this deterministic priority: `recorded_at` frontmatter, `date`
frontmatter, a `YYYY-MM-DD` or `YYYY-MM-DD.md` filename, then the file
creation timestamp. Existing Entries keep their stored `recordedAt` even when
the note is edited. `sourceUpdatedAt` records the source file mtime and may
change on every registration. Invalid explicit or filename dates are rejected
rather than silently falling back to the current time.

The Node API exposes local development endpoints:

* `POST /v1/entries` creates or upserts a source-backed Entry.
* `PUT /v1/entries/:id`, `GET /v1/entries`, and `GET /v1/entries/:id` provide
  CRUD reads and updates scoped by `userId`.
* `DELETE /v1/entries/:id` archives rather than destroys the Entry.
* `GET /v1/exports/entries` returns all Entries, including archived records.

The mobile JSON export now includes the `entries` and derived `search_documents`
tables. API keys, note bodies,
and sensitive values are not written to logs.

## Editor integration

The authoritative Markdown folder and its watcher belong to Personal Context
Studio. VS Code, Cursor, Obsidian, or another editor may open that folder
directly. MeTheory has no editor-specific plugin and performs no bidirectional
note synchronization. PCS exposes reviewed values to MeTheory through the
`pcs-analysis-snapshot-v1` localhost contract.

## Search and AI boundaries

`packages/search-core/src/index.ts` now supplies a dependency-free lightweight
Tokenizer and deterministic BM25 ranker. On Entry create or update, the API and
mobile repository derive a `search_documents` row with precomputed tokens. On
archive, the derived row is removed. `POST /v1/search-documents/rebuild`
deletes that user's Entry search documents, loads current unarchived Entries,
tokenizes them, and inserts the rebuilt set in one transaction. A failure
rolls back the deletion and inserts. This removes orphaned documents, excludes
archives, does not affect other users or other source kinds, and returns
`{ sourceKind: "entry", deleted, indexed, removed }`. `GET
/v1/search?userId=...&q=...` returns source references, snippets, scores,
matched terms, and timestamps.

The initial indexed source is `entry`. Hypotheses, Evidence, and parameter
values remain future builders. Search documents are still replaceable and can
always be regenerated from the authoritative records.

The stable `my-search_public` repository is unchanged. Its BM25 evaluation,
token precomputation, pagination, tags, links, and test ideas inform the next
phase, while its Express routes, `better-sqlite3` repository, static UI, and
external-content ingestion do not cross this boundary.

AI is not part of Phase 1 Entry registration. Future AI proposals must pass
JSON-schema validation, domain validation, sensitive-data policy checks, and
user approval before they save any template, structured value, hypothesis, or
personal-model claim.

## Verification and next phase

`test/entries.test.ts` verifies idempotent schema application, API CRUD,
timestamp preservation, source-based note upsert, full search rebuild behavior,
user isolation, archive exclusion, and input validation. It also verifies that a failed rebuild
restores the prior Entry and non-Entry documents. `test/search-core.test.ts`
covers tokenization and stable BM25 result references. Run the full suite with
`npm run verify`.

Before the next search increment, add builders for hypotheses and Evidence,
search-quality fixtures derived from real user-approved examples, and user
controls for any AI-assisted structuring.

## Closed-loop boundary

MeTheory consumes confirmed, generic PCS snapshots and may create a pending
`Template Request` through the generic integration contract when an experiment
has a shortage. PCS remains the owner of Markdown, templates, extraction
review, sharing, and privacy for records. MeTheory owns hypotheses,
experiment-specific questions, observations, evaluation, and Self Model review.
No PCS-specific endpoint, table, or runtime dependency was added.