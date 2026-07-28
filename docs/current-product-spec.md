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
- Deterministic hypothesis evaluation, candidate generation primitives, evidence inspection, dynamic question support in the mobile experiment client, and `npm run verify`.

## Next implementation

1. Add richer Review context for field labels, source spans, existing-value diffs, and field sensitivity in the desktop UI.
2. Complete readiness polling for each supported local runtime; process ownership, one retry, and idle-operation protection already exist.
3. Improve ordinary backup/delete UX while keeping advanced export history and encryption out of the initial version.

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
