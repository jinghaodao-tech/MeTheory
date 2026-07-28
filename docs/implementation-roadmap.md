# Implementation Roadmap

This roadmap follows user-visible product stages. The current scope is defined
by [`current-product-spec.md`](current-product-spec.md); this file is the
execution order, not a separate product definition.

## Stage 1: recording and structuring

User experience: enter a theme, open a note in `notes/inbox` immediately,
write without waiting for AI, attach a reviewed template, and structure only
the tracked note after saving. Uncertain values are reviewed field by field.

Implemented baseline:

- provisional note creation, `tracked: true`, `auto_structure: true`, and non-blocking template processing;
- three-second save debounce, source-content hashing, stale-result rejection, and one automatic retry;
- field-level Review with value, confidence, inferred source, edit, approve, unknown, reject, re-extract, and open-note actions;
- one retry, ownership-aware stop, and 15-minute idle protection for MeTheory-owned local runtime processes;
- human-readable CLI output by default and stable `--json` output for agents.

Remaining refinement: show per-field existing-value diffs, richer source spans, and sensitivity labels directly in Review, and add runtime-specific readiness polling.

## Stage 2: self-understanding vertical slice

For a selected one-to-four-week period, aggregate structured values and present
three to five non-diagnostic hypotheses. Each hypothesis shows the statement,
period, supporting Entries, contradicting Entries, missing data, confidence,
user review (`fits`, `does_not_fit`, `on_hold`), a small next experiment, and a
proposed Self Model update. Acceptance never happens automatically.

The first domains are behavior, fatigue and mood, person/environment fit,
starting/continuing/recovery, state-dependent tendencies, and relatively stable
tendencies. The deterministic comparison evaluator remains the authority for
evidence direction and insufficiency.

The implementation requires eight confirmed Entries and three values in each
comparison group. Semantic roles map field pairs to an allowlisted non-clinical
construct, candidate history controls emerging/state-dependent/relatively
stable scope, and duplicate comparisons are merged while preserving evidence.
Legacy history without Entry-set identity is not sufficient for stable scope;
the API also returns excluded fields and data-quality counts for user review.
See
[`self-understanding-practical-v1.md`](self-understanding-practical-v1.md) for
the non-clinical boundary and the persisted review flow.

## Stage 3: minimum practical safety

- sensitive-field warnings and one-time field approval;
- external AI approval by template field, provider, and destination host;
- refusal to persist passwords, API keys, tokens, or private keys;
- ordinary backup and ordinary deletion;
- no automatic Markdown body edits.

Advanced diff exports, anonymous export IDs, encrypted exports, complex backup
regeneration, and detailed export history are later work.

## Deferred architecture

Cloud sync, PostgreSQL/vector databases, MCP actions, general-purpose desktop
packaging, and distributed services remain future architecture research. The
mobile experiment client remains supported but does not redefine the primary
desktop product flow.

## Historical beta criteria

The earlier beta checklist is retained for reference. It does not require
cloud deployment or a PostgreSQL migration for the current local-first MVP.
