# MeTheory Current Product Specification

This document is the current product specification for the local-first MeTheory implementation. Older documents remain useful as research or historical context, but this document wins when they disagree.

## Purpose

MeTheory turns natural-language Markdown records into user-reviewed structured values, evidence-backed self-understanding hypotheses, and an editable personal operating manual. It is a private local information foundation, not a diagnostic system.

## Initial practical version

The first practical version is complete when a user can create a note from a theme without waiting for AI, attach or create a template, structure only that tracked note after saving, review uncertain field values, analyze one to four weeks of structured records, inspect supporting and contradicting records, rate a hypothesis as fits/does not fit/on hold, and review a proposed Self Model change before accepting it. The flow must remain usable with no cloud AI and must preserve Markdown when local AI is unavailable.

## Local-first policy

Markdown is the human-readable source for free records. SQLite is the local operational store for Entries, templates, structured field values, experiment observations, hypotheses, evidence, consent, and derived search indexes. No cloud sync is required. External AI is optional and must be approved per template field, provider, and destination host. Secrets are rejected rather than stored.

## Responsibility boundaries

- **Markdown / VS Code / Cursor / Obsidian:** writing, editing, and the human-readable record.
- **Entry:** a reference to a free record, with recorded time kept separate from source update time.
- **SQLite:** templates, extracted values, review state, experiments, hypotheses, evidence, privacy decisions, and rebuildable indexes.
- **Experiment data:** explicit observations and parameter values used for evaluation. An Entry is never implicitly converted into an experiment observation.
- **CLI:** scriptable local operations, with human-readable output by default and stable JSON only with `--json`.

## AI boundary

AI may suggest templates, titles, structured values, wording for questions, and plain-language explanations of an already computed self-understanding candidate. AI must not decide facts, evidence strength, diagnosis, hypothesis status, consent, notification timing, or Self Model updates. Self-understanding explanation receives a versioned DTO with aggregate statistics and allowlisted Entry references, never Markdown bodies. Only localhost AI endpoints are accepted; invalid JSON, invented statistics, unknown Entry IDs, or clinical and absolute claims fall back to deterministic wording. Every extracted value is reviewable, stale extraction results are rejected, and deterministic fallback behavior keeps recording available.

## Supported clients

VS Code and Cursor are the primary desktop workflow. The CLI provides workspace, sync, template, extraction, privacy, backup, and local AI operations. Obsidian is supported as a Markdown Entry source. The mobile app remains a compatible local experiment client; it is not the primary free-record authoring workflow.

## Implemented now

- Local Node API and SQLite schema for Entries, templates, structured field values, hypotheses, evaluations, evidence, privacy, and search.
- Shared Markdown parsing, timestamp preservation, generated Obsidian bundle, and idempotent Entry sync.
- Local AI provider boundary, manual ChatGPT prompt/result workflow, mock provider, disabled provider, extraction hashing, stale-result rejection, and privacy checks.
- Workspace initialization, status, backup/restore checks, CLI extraction review, and VS Code Start, Status, Privacy, Templates, Review, Self Understanding, and Entries views.
- Provisional inbox-note creation, non-blocking template suggestions, tracked-note save debounce, a single extraction retry, and explicit extraction approval before SQLite updates.
- Self-understanding: confirmed-value-only analysis, eight-record quality gate, semantic-role-to-construct mapping, candidate history and deduplication, emerging/state-dependent/relatively-stable scopes, deterministic Japanese explanations, optional validated localhost-AI wording, evidence links, ratings, and editable user-confirmed Self Model additions.
- External-asset safety: versioned `SelfUnderstandingInterpretationV3` validation with deterministic fallback, localhost-only ActivityWatch preview/import with normalized provenance, separate original IPIP-inspired self-perception responses, deterministic question-quality checks, and fixed non-AI chart data models.
- Analysis responses include data quality and excluded fields. Unconfirmed roles, unsupported field types, and unknown semantic roles are visible to the user and do not become hypotheses.
- Deterministic hypothesis evaluation, candidate generation primitives, evidence inspection, dynamic question support in the mobile experiment client, and `npm run verify`.

## Next implementation

1. Add richer Review context for field labels, source spans, existing-value diffs, and field sensitivity in the desktop UI.
2. Complete readiness polling for each supported local runtime; process ownership, one retry, and idle-operation protection already exist.
3. Improve ordinary backup/delete UX while keeping advanced export history and encryption out of the initial version.
4. Add richer VS Code rendering for fixed chart models and a guided baseline questionnaire; the local API and storage contracts are already present.

Self-understanding explanation uses deterministic wording by default. Optional
local wording is enabled with `SELF_UNDERSTANDING_AI_PROVIDER=ollama` or
`openai-compatible-local`. Configure `SELF_UNDERSTANDING_AI_BASE_URL` and
`SELF_UNDERSTANDING_AI_MODEL` as needed. The URL must resolve to
`localhost`, `127.0.0.1`, or `::1`; an external host is rejected.

## Non-goals

Medical or psychological diagnosis, fixed personality labels, cloud sync, a general-purpose desktop application, PostgreSQL/vector database migration, complex microservices, automatic Self Model updates, and allowing AI to make final factual or evidentiary decisions are outside the initial practical version.

## Status labels for older documents

- `architecture-research.md`, `technical-architecture.md`, and `mcp-tools.md` are **future architecture research** where they describe cloud, MCP, or scale-out designs.
- `design-spec.md`, `domain-language.md`, `hypothesis-evaluation.md`, `collection-responsibility.md`, and `implementation-roadmap.md` are **historical or domain reference** documents. They remain useful, but this document defines the current product scope.

## Closed-loop experiment slice

The current implementation also supports the first closed loop from a confirmed
self-understanding candidate to a user-reviewed experiment result. A candidate
can produce an editable draft; explicit acceptance creates a ready experiment;
collection is linked to existing check-ins and parameter values; evaluation is
deterministic; and the result is retained as a hypothesis timeline event.
Self Model freshness is a review queue, not an automatic update.

Experiment questions and collection plans are local and deterministic. A plan
may contain a generic pending PCS template request, but MeTheory does not call a
PCS-specific endpoint, activate a template, write a confirmed PCS value, or
copy Markdown bodies into its database.
## Portfolio primary flow

The reproducible portfolio flow is:

`PCS analysis snapshot V2 -> MeTheory Node API -> SQLite -> Demo Web`.

The snapshot contract is strict and versioned. It carries a profile binding, period, record identifiers, field roles, scale fingerprints, provenance, privacy level, and explicit exclusions. MeTheory rejects unconfirmed roles, unsupported values, invalid scales, private values, profile mismatches, unknown properties, and periods outside the requested range. A live PCS request is allowed only to localhost and requires `profileId`, `from`, `to`, and `timezone`.

`pcs_profile_bindings` binds one PCS profile to one MeTheory user. `pcs_analysis_runs` is append-only at the snapshot level: each run stores `snapshotId`, `profileId`, `generatedAt`, period, schema version, source record IDs, source fingerprint, and contract hash. Re-running the same snapshot is idempotent; a new snapshot creates a new history item and does not overwrite an older result.

Candidate generation uses explicit semantic roles and the versioned `candidate-pair-v1` allowlist. It does not infer meaning from labels. Every candidate has supporting and contradicting evidence, an episode kind, and provenance. It is a non-clinical observation about conditions and recorded outcomes, not a diagnosis or causal conclusion.

The Demo Web is intentionally local and fixture-first. It has loading, empty, error, and unavailable states; no Markdown body or secret is sent to a cloud service. Candidate review, experiment draft editing, experiment acceptance, check-ins, deterministic evaluation, and Self Model proposal review are explicit user actions. No candidate is automatically approved, started, notified, evaluated, or merged into the Self Model.

## Implementation status

- **Implemented:** PCS snapshot V2 validation, profile binding, immutable analysis history, pair allowlist, provenance-aware evidence, versioned SQLite migration runner, closed-loop experiment APIs, local deterministic fixture Demo Web, and targeted tests.
- **Experimental:** Expo mobile client, Obsidian adapter, ActivityWatch adapter, and optional localhost AI wording.
- **Planned:** deeper route/service split, richer desktop field-level Review UI, integration SDK contract tests, encrypted backups, and broader longitudinal stability analysis.
- **Removed from the product path:** cloud sync, automatic merge, diagnostic inference, cloud AI dependency, and the AI review/Codex loop as a runtime requirement. Review Bridge files may remain as isolated development tooling.

## Failure and decision log

- PCS unavailable: use fixture mode and keep the Markdown workflow available.
- Snapshot invalid or profile mismatch: fail the complete analysis; do not produce partial hypotheses.
- Local AI unavailable: use deterministic wording; do not block recording or analysis.
- SQLite migration failure: stop startup rather than apply an unversioned column change.
- Evidence is displayed with supporting and contradicting records, data shortage, exclusions, and provenance before a user can create an experiment.