# MeTheory Current Product Specification

This document is the current product specification for the local-first MeTheory implementation. Older documents remain useful as research or historical context, but this document wins when they disagree.

## Purpose

MeTheory analyzes user-confirmed structured records from Personal Context Studio, produces evidence-backed self-understanding hypotheses, and maintains an editable personal operating manual. It is a private local analysis foundation, not a diagnostic system.

## Initial practical version

The first practical version is complete when a user can record and review context in Personal Context Studio, analyze one to four weeks of confirmed records in MeTheory, inspect supporting and contradicting records, rate a hypothesis as fits/does not fit/on hold, and review a proposed Self Model change before accepting it. The flow must remain usable with no cloud AI and must preserve Markdown when local AI is unavailable.

## Local-first policy

Personal Context Studio owns Markdown and its local SQLite store for documents, templates, structured field values, review state, and search. MeTheory owns its separate local SQLite store for experiment observations, hypotheses, evidence, consent, and Self Model changes. The two services exchange versioned localhost JSON only; no cloud sync is required.

## Responsibility boundaries

- **Personal Context Studio / Markdown / VS Code / Cursor / Obsidian:** writing, editing, local search, templates, local-AI candidates, and the human-readable record.
- **PCS analysis snapshot:** reviewed, shareable structured values and source references, without Markdown bodies.
- **MeTheory SQLite:** experiments, hypotheses, evidence, privacy decisions, and Self Model changes.
- **Experiment data:** explicit observations and parameter values used for evaluation. An Entry is never implicitly converted into an experiment observation.
- **CLI:** scriptable local operations, with human-readable output by default and stable JSON only with `--json`.

## AI boundary

AI may suggest templates, titles, structured values, wording for questions, and plain-language explanations of an already computed self-understanding candidate. AI must not decide facts, evidence strength, diagnosis, hypothesis status, consent, notification timing, or Self Model updates. Self-understanding explanation receives a versioned DTO with aggregate statistics and allowlisted Entry references, never Markdown bodies. Only localhost AI endpoints are accepted; invalid JSON, invented statistics, unknown Entry IDs, or clinical and absolute claims fall back to deterministic wording. Every extracted value is reviewable, stale extraction results are rejected, and deterministic fallback behavior keeps recording available.

## Supported clients

Personal Context Studio provides the VS Code, Cursor, Obsidian, local search, template, and local-AI workflow. MeTheory provides the experiment and analysis workflow. The mobile app remains a compatible local experiment client; it is not the primary free-record authoring workflow.

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
