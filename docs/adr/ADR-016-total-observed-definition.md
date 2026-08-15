# ADR-016: Include all five dev-pace states in total_observed for PCS analysis ratios

## Context

`analyzePcsAnalysisSnapshot` (`packages/self-understanding/src/pcsSnapshotAnalysis.ts`)
derives `ai_conversation_ratio` and `deep_thinking_ratio` — the condition and
outcome of the one correlation this file computes — by dividing
`ai_conversation_minutes` / `deep_thinking_minutes` by a "total observed
minutes" figure for the day.

That total is computed (previously lines 282–285) as
`active_minutes + idle_minutes + away_minutes` only. It excludes exactly the
two fields used as the ratio numerators. dev-pace's own aggregator
(`tools/aggregate_activity.py`) already produces a genuine
`total_observed_minutes` field summing all five states, but PCS's ingestion
contract for the `dev-pace-daily-v1` template
(`apps/api/src/routes/content.ts:122`) does not currently accept that field —
MeTheory has to reconstruct "total" itself from whichever raw per-state
fields survive the pipeline, and the existing reconstruction was incomplete.

Practical effect: a day dominated by deep-thinking or AI-conversation time
(little active/idle/away) gets an artificially small or zero denominator. At
`total = 0` the day is dropped from the `totals` array entirely (the
`total > 0` filter) — so the days most relevant to what this analysis claims
to measure (focus, AI-conversation intensity) are exactly the days most
likely to be silently excluded from it.

No test in this repository (`test/pcs-snapshot.test.ts`,
`test/pcs-cross-repository.test.ts`, `test/pcs-live-cross-repository.e2e.test.ts`)
exercises `robustness`, `totalObservedDefinition`, or either derived ratio
field, so this had never been checked even against a synthetic example.

This is a different problem from the confounding limitation already
documented in `docs/spec/analysis-limitations.md` ("dev-pace's AI-conversation
time and total observed time are not independent"). That entry describes an
inherent statistical limitation of comparing two non-independent quantities.
This ADR is about the total itself being computed with an incomplete
formula — an implementation defect, not a disclosed methodological
limitation.

## Decision

Redefine `total_observed` for the robustness section as the sum of all five
dev-pace states — `active_minutes + ai_conversation_minutes +
deep_thinking_minutes + idle_minutes + away_minutes` — not three of them.

- `totals` reads and sums all five raw fields, requiring all five to be
  present (matching the existing all-or-nothing validity check).
- `totalObservedDefinition` in the `PcsAnalysisResult` type and the returned
  object is updated to the literal string reflecting the new formula, so any
  future consumer of this public field sees the true definition.
- `total_observed_stratum`'s short/long median split is recomputed on the
  corrected total, since the previous median was computed from the same
  incomplete sum.

## Consequences

- Days that were previously excluded because active+idle+away happened to be
  0 (a fully-focused day, or a day spent entirely in AI conversation) now
  have a nonzero total and are included in the correlation and
  ratio-comparison output for the first time.
- `ai_conversation_ratio` and `deep_thinking_ratio` shift for every day (the
  denominator grows), so candidate scores or analysis-history rows computed
  under the old formula are not directly comparable to new runs.
  `self_understanding_analysis_history` / `pcs_analysis_runs` rows already
  stored keep whatever they stored (ADR-004: immutable analysis history) —
  this ADR does not retroactively rewrite them, only changes what future
  runs compute.
- `test/pcs-snapshot-robustness.test.ts` (new) locks in both the corrected
  formula and the previously-untested exclusion behavior, using a synthetic
  fixture with an explicit fully-focused day, so a future change cannot
  silently reintroduce the incomplete denominator without a test failing.

## Rejected alternative

Ingest dev-pace's own `total_observed_minutes` field through the PCS
contract instead of recomputing it in MeTheory. This is the more "honest"
long-term fix — trust the source's own total rather than reconstruct it —
but it requires a PCS template/`content.ts` contract change and a
`v1-scope.md`-adjacent decision that has not been made, which is out of
scope for this fix. Recomputing from the five components MeTheory already
receives corrects the actual defect (the formula silently dropping two
categories) without touching the PCS↔MeTheory contract. Revisit this
alternative if the PCS contract is revised for other reasons.
