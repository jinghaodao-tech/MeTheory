# MeTheory Current Product Specification

This document is the current product specification for the local-first MeTheory implementation. Older documents remain useful as research or historical context, but this document wins when they disagree.

## Purpose

MeTheory analyzes user-confirmed structured records from Personal Context Studio, produces evidence-backed self-understanding hypotheses, and maintains an editable personal operating manual. It is a private local analysis foundation, not a diagnostic system.

## Initial practical version

The first practical version is complete when a user can record and review context in Personal Context Studio, analyze one to four weeks of confirmed records in MeTheory, inspect supporting and contradicting records, rate a hypothesis as fits/does not fit/on hold, and review a proposed Self Model change before accepting it. The flow must remain usable with no cloud AI and must preserve Markdown when local AI is unavailable.

The itemized v1 / v1.1 / v1.2 scope decision, including what is explicitly excluded, is [docs/spec/v1-scope.md](spec/v1-scope.md).

## Local-first policy

Personal Context Studio owns Markdown and its local SQLite store for documents, templates, structured field values, review state, search, local-AI execution, and all consent for sending record content to an external AI. MeTheory owns its separate local SQLite store for experiment observations, hypotheses, evidence, experiment-specific privacy decisions, and Self Model changes. The two services exchange versioned localhost JSON only; no cloud sync is required.

## Responsibility boundaries

- **Personal Context Studio / Markdown:** editor-agnostic writing, local search, templates, local-AI candidates, the human-readable record, and document/field/provider/host external-AI consent. VS Code, Cursor, and Obsidian are interchangeable editors of the same folder.
- **PCS analysis snapshot:** reviewed, shareable structured values and source references, without Markdown bodies.
- **MeTheory SQLite:** experiments, hypotheses, evidence, experiment-specific privacy decisions, and Self Model changes. It never receives Markdown bodies.
- **Experiment data:** explicit observations and parameter values used for evaluation. An Entry is never implicitly converted into an experiment observation.
- **CLI:** scriptable local operations, with human-readable output by default and stable JSON only with `--json`.

## AI boundary

PCS may suggest templates and structured values. Before record content goes to a manual external-AI provider, PCS requires active consent for the document and every selected template field, scoped by provider and destination host; `never` and `highly_sensitive` fields are refused. MeTheory AI may only provide plain-language wording for an already computed self-understanding candidate and receives a versioned DTO with aggregate statistics and allowlisted Entry references, never Markdown bodies. AI must not decide facts, evidence strength, diagnosis, hypothesis status, consent, notification timing, or Self Model updates. Invalid JSON, invented statistics, unknown Entry IDs, or clinical and absolute claims fall back to deterministic wording.

## Supported clients

Personal Context Studio watches a configured Markdown folder and provides local search, template, Review, and local-AI workflows. It also exposes bounded read-only MCP tools for Codex and Claude Code. MeTheory provides the experiment and analysis workflow. The mobile app remains a compatible local experiment client; it is not the primary free-record authoring workflow.

## Implemented now

- Local Node API and SQLite schema for experiment observations, hypotheses, evaluations, evidence, experiment privacy, and Self Model changes.
- PCS-owned Markdown parsing, timestamp preservation, stable-save watching, regenerable search indexing, and stale extraction rejection.
- PCS CLI/API workflows for templates, extraction candidates, per-value Review, local runtime control, external-AI consent, and bounded context access.
- A read-only PCS MCP surface for search, excerpts, confirmed context, and pending Review status.
- Self-understanding: confirmed-value-only analysis, eight-record quality gate, semantic-role-to-construct mapping, candidate history and deduplication, emerging/state-dependent/relatively-stable scopes, deterministic Japanese explanations, optional validated localhost-AI wording, evidence links, ratings, and editable user-confirmed Self Model additions.
- External-asset safety: versioned `SelfUnderstandingInterpretationV3` validation with deterministic fallback, localhost-only ActivityWatch preview/import with normalized provenance, separate original IPIP-inspired self-perception responses, deterministic question-quality checks, and fixed non-AI chart data models.
- Analysis responses include data quality and excluded fields. Unconfirmed roles, unsupported field types, and unknown semantic roles are visible to the user and do not become hypotheses.
- Deterministic hypothesis evaluation, candidate generation primitives, evidence inspection, dynamic question support in the mobile experiment client, and `npm run verify`.

## Next implementation

1. Add richer Review context for field labels, source spans, existing-value diffs, and field sensitivity in the desktop UI.
2. Complete readiness polling for each supported local runtime; process ownership, one retry, and idle-operation protection already exist.
3. Improve ordinary backup/delete UX while keeping advanced export history and encryption out of the initial version.
4. Add a guided baseline questionnaire and a richer client for fixed chart models; the local API and storage contracts are already present.

Self-understanding explanation uses deterministic wording by default. Optional
local wording is enabled with `SELF_UNDERSTANDING_AI_PROVIDER=ollama` or
`openai-compatible-local`. Configure `SELF_UNDERSTANDING_AI_BASE_URL` and
`SELF_UNDERSTANDING_AI_MODEL` as needed. The URL must resolve to
`localhost`, `127.0.0.1`, or `::1`; an external host is rejected.

## Non-goals

Medical or psychological diagnosis, fixed personality labels, cloud sync, a general-purpose desktop application, PostgreSQL/vector database migration, complex microservices, automatic Self Model updates, and allowing AI to make final factual or evidentiary decisions are outside the initial practical version.

## Status labels for older documents

- `architecture-research.md`, `technical-architecture.md`, and `mcp-tools.md` are **future architecture research** where they describe cloud, MCP, or scale-out designs.
- docs/spec/domain-language.md, docs/spec/hypothesis-evaluation.md, and docs/spec/collection-responsibility.md are current normative domain specifications.
- docs/archive/design-spec.md and docs/archive/implementation-roadmap.md are historical documents. docs/architecture-research.md, docs/technical-architecture.md, and docs/mcp-tools.md are future architecture research.

## Closed-loop experiment slice

The current implementation also supports the first closed loop from a confirmed
self-understanding candidate to a user-reviewed experiment result. A candidate
can produce an editable draft; explicit acceptance creates a ready experiment;
collection is linked to existing check-ins and parameter values; evaluation is
deterministic; and the result is retained as a hypothesis timeline event.
Self Model freshness is a review queue, not an automatic update.

Experiment questions and collection plans are local and deterministic. A plan
may contain a generic pending PCS template request. MeTheory uses the official
localhost PCS Integration API client for the profile-scoped analysis snapshot,
but does not activate a template, write a confirmed PCS value, or copy
Markdown bodies into its database.
## Portfolio primary flow

The reproducible portfolio flow is:

`PCS analysis snapshot v2 (revision v2.1) -> MeTheory Node API -> SQLite -> Demo Web`. The canonical version constants live only in the official personal-context-studio/integration-contracts package.

The snapshot contract is strict and versioned. It carries a profile binding, period, record identifiers, field roles, scale fingerprints, provenance, privacy level, and explicit exclusions. MeTheory rejects unconfirmed roles, unsupported values, invalid scales, private values, profile mismatches, unknown properties, and periods outside the requested range. A live PCS request is allowed only to localhost and requires `profileId`, `from`, `to`, and `timezone`.

`pcs_profile_bindings` binds one PCS profile to one MeTheory user. `pcs_analysis_runs` is append-only at the snapshot level: each run stores `snapshotId`, `profileId`, `generatedAt`, period, schema version, source record IDs, source fingerprint, and contract hash. Re-running the same snapshot is idempotent; a new snapshot creates a new history item and does not overwrite an older result.

Candidate generation uses explicit semantic roles and the versioned `candidate-pair-v1` allowlist. It does not infer meaning from labels. Every candidate has supporting and contradicting evidence, an episode kind, and provenance. It is a non-clinical observation about conditions and recorded outcomes, not a diagnosis or causal conclusion.

The Demo Web is intentionally local and fixture-first. It has loading, empty, error, and unavailable states; no Markdown body or secret is sent to a cloud service. Candidate review, experiment draft editing, experiment acceptance, check-ins, deterministic evaluation, and Self Model proposal review are explicit user actions. No candidate is automatically approved, started, notified, evaluated, or merged into the Self Model.

## Implementation status

- **Implemented:** PCS snapshot v2.1 validation, profile binding, immutable analysis history, pair allowlist, provenance-aware evidence, versioned SQLite migration runner, closed-loop experiment APIs, local deterministic fixture Demo Web, and targeted tests.
- **Experimental:** Expo mobile client, Obsidian adapter, ActivityWatch adapter, and optional localhost AI wording.
- **Planned:** deeper route/service split, richer desktop field-level Review UI, integration SDK contract tests, encrypted backups, and broader longitudinal stability analysis.
- **Removed from the product path:** cloud sync, automatic merge, diagnostic inference, cloud AI dependency, and the AI review/Codex loop as a runtime requirement. Review Bridge files may remain as isolated development tooling.

## Failure and decision log

- PCS unavailable: use fixture mode and keep the Markdown workflow available.
- Snapshot invalid or profile mismatch: fail the complete analysis; do not produce partial hypotheses.
- Local AI unavailable: use deterministic wording; do not block recording or analysis.
- SQLite migration failure: stop startup rather than apply an unversioned column change.
- Evidence is displayed with supporting and contradicting records, data shortage, exclusions, and provenance before a user can create an experiment.
