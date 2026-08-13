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
  `docs/operations-status.md`. `docs/current-product-spec.md` and
  `README.md` both state this explicitly ("Supported clients" /
  "Excluded client scope"), so this scope decision is consistent with the
  rest of the documentation as of 2026-08-13.

## Release rule

The v1 gate covers the nine items above under "v1." v1.1 and v1.2 items
remain tracked and testable but do not block the v1 scope decision unless a
dependency makes a v1 item unsafe or unverifiable. Excluded items do not
count toward v1 completion under any circumstance; re-including the mobile
client would require a new, separate scope decision, not a documentation fix.

## Verification

What actually confirms each v1 item is done, not just declared. Automated
coverage was checked against the current test suite on 2026-08-13; gaps are
listed explicitly rather than assumed closed.

1. **PCS snapshot analysis** — partial. `test/external-assets.test.ts`,
   `test/pcs-snapshot.test.ts`, and `test/pcs-cross-repository.test.ts`
   cover schema strictness and deterministic fallback. **Gap:** no test
   enforces the 1-4 week period bound specifically, and no test asserts
   with a Markdown-shaped payload that Markdown is rejected — this is only
   implied by the contract's property allowlist, never directly exercised.
2. **Deterministic hypothesis lifecycle + significance evaluation** —
   partial. `test/domain.test.ts` and `test/hypothesis-evaluation.test.ts`
   cover the permutation/Bonferroni math and all four evaluation outcomes.
   **Gap:** `"paused"` is a separate DB `state` column, not part of
   `HYPOTHESIS_STATUSES` in `packages/domain/src/index.ts`, and no test
   anywhere exercises a hypothesis actually in the paused state.
3. **Supporting and contradicting evidence with kind/provenance** —
   partial. `test/pcs-snapshot.test.ts` asserts supporting evidence has
   `kind`/`provenance`. **Gap:** no test ever populates or asserts
   contradicting evidence with real content — every reference checks it is
   empty, never that a real contradicting entry round-trips correctly.
4. **Rate a hypothesis fits/does not fit/on hold** — covered.
   `test/hypothesis-review-api.test.ts` calls the live
   `POST /v1/self-understanding/reviews` endpoint directly: rejects an
   invalid rating (`hypothesis_review_invalid`) and an unknown candidate
   (`self_understanding_candidate_not_found`), confirms `fits` proposes a
   Self Model candidate while `on_hold` does not, and confirms both ratings
   land in review history regardless of outcome. Candidates are seeded via
   `SqliteSelfUnderstandingRepository.analyze()` directly against the same
   SQLite file the HTTP server uses, since the real
   `/v1/self-understanding/analyze` endpoint requires a live PCS server and
   is out of scope for this test.
5. **Self Model change requires explicit review before accepting** —
   covered. `test/self-model-review-api.test.ts` calls the live
   `POST /v1/self-understanding/self-model-candidates/review` endpoint:
   confirms proposing a candidate (via a `fits` rating) never by itself
   writes to `self_beliefs`; confirms explicit `accepted` is the only path
   that does, and that a second review of the same (now non-`proposed`)
   candidate is rejected rather than silently reapplied; confirms `rejected`
   never creates a belief; confirms an invalid status and an unknown
   candidate are both rejected; confirms `update_existing` refuses an
   unvalidated or nonexistent target rather than overwriting a belief
   blind. This was the product's core non-automation guarantee with zero
   coverage — it no longer rests on manual trust alone.
6. **Closed-loop candidate → draft → experiment → evaluation → timeline
   event** — partial. `test/experiments-api.test.ts` chains
   draft→accept→active→observations→completed→evaluate in one test, ending
   `status: "supported"`. **Gap:** that test never passes a `hypothesisId`,
   so the final leg — retention as a hypothesis timeline event
   (`hypothesis_timelines`/`experiment_hypothesis_links`) — has zero test
   coverage anywhere in the suite.
7. **Demo Web states (loading/empty/error/unavailable, fixture-first)** —
   partial. `test/demo-web.test.mjs` and `demo-profile-binding.test.mjs`
   are static regex checks on source text (confirms loading/fixture
   strings exist, no OpenAI dependency). **Gap:** no test actually runs the
   server/DOM to functionally exercise the empty, error, or
   PCS-unavailable states.
8. **Versioned SQLite migrations, append-only/idempotent
   `pcs_analysis_runs`** — covered. `test/migrations-integrity.test.ts`
   and `test/pcs-snapshot.test.ts` directly test idempotent re-save and
   immutability by snapshot id.
9. **Usable with zero cloud AI, deterministic wording** — covered at the
   unit level. `test/self-understanding.test.ts` exercises the exact
   provider-resolution branch used when no AI is configured and confirms
   `mode: "deterministic_fallback"`. Not a full HTTP pipeline test, but the
   only AI touchpoint in the analysis flow.

Items 4 and 5 — both core non-automation guarantees (a human must rate a
hypothesis; a human must accept a Self Model change) — are now covered by
`test/hypothesis-review-api.test.ts` and `test/self-model-review-api.test.ts`
(2026-08-13). Items 1, 2, 3, 6, and 7 are still only partially covered; the
specific gaps listed above are what "partial" means, not a formality.
