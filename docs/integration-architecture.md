# MeTheory Integration Architecture

## Product boundary

MeTheory is the local-first analysis and experiment component. Personal
Context Studio (PCS) is the local-first record component. The boundary is
intentional: MeTheory does not receive Markdown bodies, run an editor plugin,
or maintain a second copy of a user's notes.

| Owner | Responsibility |
| --- | --- |
| PCS | Markdown documents, templates, local search, extraction, value review, record-level privacy, and local/external AI consent |
| MeTheory | Experiments, observation episodes, hypothesis generation and evaluation, Evidence, and user-reviewed Self Model proposals |
| Bridge | A versioned localhost snapshot of confirmed, shareable structured values |

PCS is opened directly in VS Code, Cursor, Obsidian, or another editor. No
editor-specific synchronization is required.

## Snapshot handoff

PCS exposes `pcs-analysis-snapshot-v1` for a selected period. Each value has a
field key, label, type, template ID, record timestamp, source document ID, and
optional allowed values, numeric bounds, unit, and analysis role metadata.

Only values that are user-confirmed, shareable for analysis, and not highly
sensitive enter the snapshot. Markdown text, API keys, private values, and
unconfirmed extraction candidates never cross the boundary. A field's semantic
role is used for analysis only when the user confirmed it and explicitly
allowed semantic merging.

MeTheory validates the snapshot before analysis. It keeps source document IDs
as evidence references, but does not copy PCS records into its database.

## Analysis and experiments

MeTheory's `observation_episodes` and `parameter_values` remain separate from
PCS records. A free record never becomes an experiment observation implicitly.
Users can choose a small experiment in MeTheory; longer or richer recording
forms are created and maintained in PCS.

MeTheory produces bounded, non-clinical hypotheses with supporting and
contradicting record references, data limitations, alternative explanations,
and a suggested next check. Self Model updates always require separate user
approval.

## Verification

`test/self-understanding.test.ts` verifies snapshot validation and deterministic
analysis without record copying. PCS owns tests for authoring, extraction,
search, Review, and record-level privacy. Run `npm.cmd run verify` in each
repository before integration changes.
