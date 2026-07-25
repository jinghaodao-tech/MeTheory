# MeTheory Integration Architecture

## Product boundary

MeTheory is becoming a local-first personal information foundation. A person
can record a note, find it again, structure selected facts, validate a
hypothesis when useful, and deliberately adopt a statement into a personal
model. The existing hypothesis system remains an `experiments` subsystem; it
is not required for ordinary note taking.

| Boundary | Current responsibility |
| --- | --- |
| Obsidian | Human-readable notes and editing |
| `entries` | Structured reference to a note, source identity, timestamps, and lifecycle |
| `observation_episodes` / `parameter_values` | Typed values collected for experiments |
| Hypotheses, Evidence, Self Model | Deterministic evaluation and user-reviewed interpretation |
| `search_documents` | Derived and replaceable search index, never a source of truth |

An Entry is never converted into an Observation implicitly. A future template
or structuring action may create parameter values only after an explicit user
action and domain validation.

## Implemented foundation

`entries` exists in both runtime SQLite schemas. The mobile database applies
the table as migration 11. The Node API applies the idempotent runtime schema
on startup. Both schemas retain all existing experiment tables and add no
destructive migration.

The Entry repository lives behind two platform adapters:

* `packages/records/src/entries.ts` owns platform-neutral Entry types and input
  validation.
* `apps/api/src/entryRepository.ts` owns Node SQLite access for Obsidian.
* `apps/mobile/src/storage/repositories/entryRepository.ts` owns Expo SQLite
  access and is exported through the existing mobile repository facade.

An Entry has a user-scoped, optional `(external_source, external_source_id)`
identity. The database indexes the pair uniquely when it exists. The Obsidian
plugin first uses this identity (`obsidian` and the note path), then persists
the returned `metheory_entry_id` in frontmatter. Later registrations use that
ID, update the existing Entry, and clear any archive marker instead of creating
a duplicate.

The Node API exposes local development endpoints:

* `POST /v1/entries` creates or upserts a source-backed Entry.
* `PUT /v1/entries/:id`, `GET /v1/entries`, and `GET /v1/entries/:id` provide
  CRUD reads and updates scoped by `userId`.
* `DELETE /v1/entries/:id` archives rather than destroys the Entry.
* `GET /v1/exports/entries` returns all Entries, including archived records.

The mobile JSON export now includes the `entries` and derived `search_documents`
tables. API keys, note bodies,
and sensitive values are not written to logs.

## Obsidian integration

`apps/obsidian-plugin` is a directly loadable minimal plugin. Its one command
registers the active note by calling the local API. It sends the file basename,
note body without frontmatter, note path, and modification time. It uses
Obsidian's `processFrontMatter` API to save only `metheory_entry_id`; it never
reformats the body. The API URL is configured in plugin settings. On its first
registration, the plugin creates or reuses the local `obsidian-local` user and
stores the returned ID locally; an explicit user ID can still be configured.

## Search and AI boundaries

`packages/search-core/src/index.ts` now supplies a dependency-free lightweight
Tokenizer and deterministic BM25 ranker. On Entry create or update, the API and
mobile repository derive a `search_documents` row with precomputed tokens. On
archive, the derived row is removed. `POST /v1/search-documents/rebuild`
rebuilds current Entry documents, while `GET /v1/search?userId=...&q=...`
returns source references, snippets, scores, matched terms, and timestamps.

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
source-based note upsert, search indexing, archive/export behavior, input
validation, and frontmatter extraction. `test/search-core.test.ts` covers
tokenization and stable BM25 result references. Run the full suite with
`npm run verify`.

Before the next search increment, add builders for hypotheses and Evidence,
search-quality fixtures derived from real user-approved examples, and user
controls for any AI-assisted structuring.
