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

AI may suggest templates, titles, structured values, and wording for questions. AI must not decide facts, evidence strength, diagnosis, hypothesis status, consent, notification timing, or Self Model updates. Every extracted value is reviewable, stale extraction results are rejected, and deterministic fallback behavior keeps recording available.

## Supported clients

VS Code and Cursor are the primary desktop workflow. The CLI provides workspace, sync, template, extraction, privacy, backup, and local AI operations. Obsidian is supported as a Markdown Entry source. The mobile app remains a compatible local experiment client; it is not the primary free-record authoring workflow.

## Implemented now

- Local Node API and SQLite schema for Entries, templates, structured field values, hypotheses, evaluations, evidence, privacy, and search.
- Shared Markdown parsing, timestamp preservation, generated Obsidian bundle, and idempotent Entry sync.
- Local AI provider boundary, manual ChatGPT prompt/result workflow, mock provider, disabled provider, extraction hashing, stale-result rejection, and privacy checks.
- Workspace initialization, status, backup/restore checks, CLI extraction review, and VS Code Start, Status, Privacy, Templates, Review, and Entries views.
- Deterministic hypothesis evaluation, candidate generation primitives, evidence inspection, dynamic question support in the mobile experiment client, and `npm run verify`.

## Next implementation

1. Finish the end-to-end desktop flow: create the provisional note, attach a reviewed template, debounce tracked-note extraction, and expose field-level review actions.
2. Add a desktop self-understanding view that turns structured values into three to five candidate hypotheses with supporting and contradicting records, a user review, a next small experiment, and a proposed Self Model update.
3. Complete local runtime lifecycle management for MeTheory-owned processes, including readiness, one retry, and 15-minute idle shutdown.
4. Improve ordinary backup/delete UX while keeping advanced export history and encryption out of the initial version.

## Non-goals

Medical or psychological diagnosis, fixed personality labels, cloud sync, a general-purpose desktop application, PostgreSQL/vector database migration, complex microservices, automatic Self Model updates, and allowing AI to make final factual or evidentiary decisions are outside the initial practical version.

## Status labels for older documents

- `architecture-research.md`, `technical-architecture.md`, and `mcp-tools.md` are **future architecture research** where they describe cloud, MCP, or scale-out designs.
- `design-spec.md`, `domain-language.md`, `hypothesis-evaluation.md`, `collection-responsibility.md`, and `implementation-roadmap.md` are **historical or domain reference** documents. They remain useful, but this document defines the current product scope.
