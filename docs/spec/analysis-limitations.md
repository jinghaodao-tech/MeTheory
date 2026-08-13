# Analysis Method Limitations

This document lists structural limitations of MeTheory's current evaluation
method that are not fixed by the significance gate itself
(`packages/domain/src/significance.ts`, `docs/evidence-thresholds.md`). Each
item states what the current implementation does, what it does not protect
against, and whether a mitigation already exists elsewhere in the system.
None of these are new statistical requirements to add before v1; they are
disclosed limitations of the v1 method, consistent with `docs/spec/v1-scope.md`.

## Binarization / quantization

Cohort assignment for a hypothesis evaluation splits episodes into two groups
using `observed_median` as documented in
`docs/adr/ADR-011-significance-fallback-and-candidate-audit.md`. Splitting a
continuous quantity at its median discards where each observation sits
relative to the boundary: a value just above the median and a value far above
it are both counted identically as "above." Non-linear relationships,
threshold effects near the actual boundary, and interaction effects that only
appear away from the median are invisible to a two-cohort mean comparison by
construction, regardless of sample size. No richer (e.g. continuous,
dose-response) evaluation exists in v1; the median split is the only cohort
assignment method implemented.

## Confounding

The evaluator compares two cohorts on one outcome for one declared condition
(`HypothesisSpec`: fixed unit, two cohorts, one outcome metric,
`candidate-pair-v1`/`v2` allowlist per ADR-003). It does not, and structurally
cannot, control for a third variable that moves with the condition. The
concrete case already found in this portfolio: dev-pace's AI-conversation
time and total observed time are not independent (more total observed time
mechanically gives more opportunity for AI-conversation time), so a candidate
built on one can look like it explains an outcome that the other equally
explains. MeTheory has no covariate-adjustment or stratification step; a
supporting evaluation result is evidence of an association under the stated
comparison, not evidence that the declared condition is the operative cause.

## Researcher degrees of freedom (multiple implicit comparisons)

`correctedAlpha(comparisonCount)` (Bonferroni) corrects for comparisons that
are explicitly run and counted. It does not correct for comparisons that were
considered and discarded before being run, or for a hypothesis that was
proposed because a pattern was already visible in the data. The
`candidate-pair-v1`/`v2` allowlist (ADR-003) narrows this somewhat by fixing
which condition/outcome role pairs are even eligible to become a candidate,
rather than letting any two fields be compared — but it does not eliminate
the choice of which eligible pair to actually evaluate, or when to look. A
hypothesis proposed after informally noticing a trend, then confirmed on the
same data that prompted it, is not protected by the significance gate even
though the gate itself is computed correctly.

## Serial correlation

The permutation test (`exactPermutationPValue`, falling back to
`monteCarloPermutationPValue` above `maximumExactPermutations`) treats
episodes as exchangeable: it assumes any observed episode could equally well
have landed in either cohort under the null. This assumption is violated if
consecutive days are correlated with each other (a multi-day mood streak, a
week where one condition dominates because of an external schedule change).
`docs/adr/ADR-014-exact-independence-check.md` checks for period *overlap*
between episodes exactly, which is a different problem (double-counting the
same time window) — it does not check for or correct day-to-day
autocorrelation. Under real serial correlation, the permutation p-value is
anti-conservative: it will report significance more often than the true
false-positive rate measured in `test/false-positive-rate.test.ts`, because
that test's synthetic data does not model serial correlation either.

## Time trends

If both the condition and the outcome drift in the same direction over the
analysis window for reasons unrelated to each other (a novelty effect at the
start of tracking, a seasonal change, an unrelated life event spanning the
period), a naive between-cohort comparison can show an apparent effect that
is really shared calendar-time drift. MeTheory does not detrend, does not
test for a trend before evaluating a hypothesis, and does not report period
start/end drift alongside a result. The one to four week analysis window
(`docs/current-product-spec.md`, "Initial practical version") limits how much
drift can plausibly accumulate before it distorts a result, but does not
eliminate the risk, and a longer window would make it worse without a
corresponding mitigation being added first.

## What is not a gap

The false-positive rate and detection-power behavior of the permutation test
itself, under the exchangeability assumption, are measured and gated
(`test/false-positive-rate.test.ts`, `evidence-thresholds.md`:
`falsePositiveAlpha`, `minimumAbsoluteEffect`). The five items above are
limitations of what the test can validly claim, not defects in the test's
own arithmetic. Fixing any of them (covariate adjustment, trend testing,
autocorrelation-aware resampling, richer cohort assignment) would be a new
v1.1+ capability, not a bug in the current implementation.
