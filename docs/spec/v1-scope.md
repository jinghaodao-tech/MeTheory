# MeTheory v1 Scope

Status: v1 declared. This file is the canonical scope; `docs/current-product-spec.md`
links here instead of duplicating the completion condition.

This document is the scope decision for v1. Moving an item to v1.1 or v1.2 does
not remove an existing implementation; it changes the release commitment. Items
under "Excluded" are not part of the v1 roadmap at all, regardless of what any
implementation currently in the repository suggests.

## v1

1. Analyze one to four weeks of PCS-confirmed records via the versioned
   `SelfUnderstandingInterpretationV3` snapshot contract, with deterministic
   fallback and no Markdown bodies transmitted.
2. Deterministic hypothesis lifecycle (`proposed` -> `tracking` -> `paused` ->
   `archived`) with permutation-test and Bonferroni-corrected significance
   evaluation (`insufficient_data` / `supports` / `challenges` / `inconclusive`).
3. Inspect supporting and contradicting evidence for every candidate, with
   episode kind and provenance attached.
4. Rate a hypothesis as fits / does not fit / on hold.
5. Review a proposed Self Model change before accepting it; no candidate is
   automatically approved, started, notified, evaluated, or merged.
6. Closed-loop flow from confirmed candidate to editable experiment draft to
   accepted experiment to deterministic evaluation, retained as a hypothesis
   timeline event.
7. Local Demo Web (fixture-first, loading/empty/error/unavailable states) as
   the primary portfolio-reproducible flow.
8. Versioned SQLite migration runner; append-only `pcs_analysis_runs` history
   (re-running a snapshot is idempotent, never overwrites an older result).
9. Usable with no cloud AI; Markdown is preserved when local AI is
   unavailable.

## v1.1

- Richer Review context in the desktop UI: field labels, source spans,
  existing-value diffs, field sensitivity.
- Complete readiness polling for every supported local runtime.
- Ordinary backup/delete UX (advanced export history and encryption stay out
  of v1).
- Guided baseline questionnaire and a richer client for fixed chart models.
- Deeper route/service split, integration SDK contract tests, broader
  longitudinal stability analysis.
- Obsidian adapter, ActivityWatch adapter, optional localhost AI wording for
  self-understanding explanations (currently Experimental).

## v1.2

- Encrypted backups.
- PostgreSQL analysis-store as a supported (not just available) option;
  `METHEORY_ANALYSIS_STORE=postgres` already exists but is non-default and
  unproven at v1.
- Cloud sync, general-purpose desktop packaging, MCP write actions,
  distributed services — deferred architecture research only, no committed
  design.

## Excluded (not on the v1 roadmap)

- **Expo mobile client (`apps/mobile`).** Archived: excluded from the root
  `package.json`, lockfile, and CI per `docs/mobile-archive.md` and
  `docs/operations-status.md`. `docs/current-product-spec.md` still lists it
  as "Experimental" and one line still describes it as "a compatible local
  experiment client," and `README.md` still documents mobile commands as
  active — both descriptions are stale and should be corrected separately
  from this scope decision, not used to justify re-including it here.

## Release rule

The v1 gate covers the nine items above under "v1." v1.1 and v1.2 items
remain tracked and testable but do not block the v1 scope decision unless a
dependency makes a v1 item unsafe or unverifiable. Excluded items do not
count toward v1 completion under any circumstance; re-including the mobile
client would require a new, separate scope decision, not a documentation fix.
