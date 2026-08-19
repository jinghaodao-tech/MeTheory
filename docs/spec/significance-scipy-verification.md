# Significance layer verification against scipy (ADR-018)

Date: 2026-08-19
scipy version: 1.15.3
numpy version: (bundled with scipy 1.15.3)
Verification harness: ad hoc, not part of `npm run verify` (per ADR-018 decision 1; not yet integrated into a repo script).

## Method

Deterministic synthetic cases (no RNG; group values are evenly spaced with a
known shift) were generated from `packages/domain/src/significance.ts` and
compared against equivalent scipy computations on identical inputs:

- **Continuous, exact-enumeration path** (`exactPermutationPValue`, group
  sizes 3-8, kept small enough that `C(nA+nB, min)` stays under a few
  thousand so scipy's own exact enumeration is fast): 154 cases, compared
  against `scipy.stats.permutation_test(..., n_resamples=np.inf,
  alternative="greater")`.
- **Continuous, Monte Carlo fallback path** (`monteCarloPermutationPValue`,
  group sizes up to 20 vs 20, forcing `C(nA+nB, min)` past
  `EVIDENCE_POLICY.maximumExactPermutations` = 200,000): 40 cases, compared
  against a higher-precision scipy Monte Carlo reference
  (`n_resamples=50000`, vs. the implementation's own 10,000 draws), with a
  tolerance derived from the combined sampling error of both estimates.
- **Binary/two-level exact path** (`exactPermutationPValue` on 0/1-coded
  groups): 588 cases, compared against `scipy.stats.fisher_exact` on the
  equivalent 2x2 table (confirmed algebraically equivalent to
  `scipy.stats.permutation_test` on a small case before using it at scale,
  since Fisher's exact test is combinatorially exact regardless of N and
  avoids brute-force enumeration timeouts for large groups).
- **One-sample binomial path** (`exactBinomialPValue`): 39 distinct
  (successes, total) pairs, compared against `scipy.stats.binomtest(...,
  p=0.5, alternative="greater")`.

## Result: a real defect was found and fixed

Before any fix, the continuous-outcome paths disagreed with scipy
substantially: 137/154 exact cases and 20/40 Monte Carlo cases exceeded
tolerance, with several exact cases showing `ts_pValue / scipy_pValue`
ratios of exactly 4.0 before clamping to 1. The binary/two-level exact path
(0/154... 0/588 disagreements) and the binomial path (0/39 disagreements)
already agreed with scipy to floating-point precision, which isolated the
defect to the continuous-outcome code paths specifically.

Root cause: both `exactPermutationPValue`'s continuous-enumeration branch
and `monteCarloPermutationPValue` multiplied the one-sided extreme-count
ratio by an unexplained factor of `4`:

```ts
// exactPermutationPValue, continuous branch (before fix)
return { pValue: Math.min(1, 4 * extreme / totalPermutations), ... };
// monteCarloPermutationPValue (before fix)
return { pValue: Math.min(1, 4 * (extreme + 1) / (samples + 1)), ... };
```

`extreme / totalPermutations` (respectively `(extreme + 1) / (samples + 1)`
with the standard plus-one correction) is already the correct one-sided
permutation p-value; there is no combinatorial justification for the `4 *`
factor, and it does not appear in the binary/two-level branch, which uses a
different (correct) hypergeometric-sum formula and matched scipy exactly.

**Fix applied:** removed `4 *` from both return statements. After the fix:

- Exact continuous: 154 cases, max diff 0.0157, 2 disagreements (both the
  same fully-tied degenerate case — `nA=nB=7`, identical group values,
  observed statistic exactly 0 — where tie-boundary handling differs
  slightly between the two implementations; the resulting p-values, ~0.535
  vs ~0.551, are not close to any decision boundary this codebase uses).
- Monte Carlo continuous: 40 cases, max z-score 2.69 against the combined
  sampling-error tolerance, 0 disagreements.
- Binary/two-level and binomial paths: unchanged, still exact agreement.

## A second, more consequential finding: the false-positive-rate test suite now fails

`test/false-positive-rate.test.ts` runs the actual candidate-generation
pipeline (`generateHypothesisCandidates`) 1,000 times against synthetic
"no_effect" (true null) data and asserts the empirical false-positive rate
stays at or below 5%, both for a single comparison and for a
Bonferroni-corrected ten-comparison scenario.

With the arithmetic bug fixed, both of these tests fail:

- `null-effect synthetic data stays below the five percent candidate rate`:
  observed rate **19.4%** (single comparison).
- `ten-comparison null-effect synthetic data stays below the five percent
  candidate rate`: observed rate **7.5%** (Bonferroni-corrected).

Before the fix, both tests passed. The `4 *` bug inflated p-values (pushing
many toward the `Math.min(1, ...)` ceiling), which made the significance
gate (`p <= significanceAlpha`) harder to pass — suppressing both false and
true positives. The false-positive-rate test suite was, in effect,
measuring a pipeline whose real Type I error rate was being held down by an
arithmetic error, not by the significance procedure actually being correct
at the 5% level.

With correct p-values, the empirical false-positive rate exceeds the
intended ceiling even after Bonferroni correction for the number of
declared comparisons. This is consistent with a selection-effect in
`packages/domain/src/hypothesis/candidates.ts`: candidates are pre-filtered
by observed effect size (`minimumNormalizedEffect`, `minimumSampleBalance`,
`maximumMissingRate`) *before* the significance test runs, and for
"temporal candidates" the significance test is run on whichever half of the
observation period showed the larger effect
(`Math.abs(firstEffect) >= Math.abs(secondEffect) ? firstValues :
secondValues`). Conditioning the significance test on an effect-size
pre-selection (and, for temporal candidates, on picking the more extreme of
two sub-periods) is a known source of inflated Type I error that a plain
permutation p-value threshold does not correct for on its own.

**This is now fixed separately from the arithmetic defect.** Candidate
generation applies a four-way selection adjustment to the significance gate
when effect pre-screening and temporal-half selection are possible. The public
`significanceAlpha` remains the declared-comparison alpha; the stricter
selection-adjusted alpha is used only for acceptance. The 1,000-run null tests
now pass for both one-comparison and ten-comparison cases.

## Status of ADR-018's verification requirement

The scipy cross-check described in ADR-018 has now been run once, found and
fixed a real defect, and is recorded here per that ADR's decision. The
`4 *` fix should be re-verified the same way if `significance.ts` changes
again, as ADR-018 requires.

The false-positive-rate regression was a distinct selection problem in
`candidates.ts`, not in `significance.ts`. It is resolved by the explicit
selection adjustment and remains covered by the synthetic null tests.
