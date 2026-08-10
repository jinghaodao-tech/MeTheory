# Evidence thresholds

MeTheory uses deterministic minimums before it emits `supports`, `challenges`, `supported`, `challenged`, or an analysis-ready state. These are product safety floors, not claims of statistical significance and not medical or psychological diagnostic criteria.

## Shared floors

| Check | Floor | Reason |
| --- | ---: | --- |
| Samples per comparison cohort | 3 | Prevent one or two records from deciding a direction. |
| Total paired samples | 6 | Require both cohorts to meet the per-cohort floor. |
| Absolute or normalized effect | 0.10 | Ignore effectively neutral differences. |
| Directional legacy evidence | 3 in the winning direction | Prevent a single boolean-like response from deciding status. |
| Directional lead | 2 | A 3-to-2 split remains inconclusive. |
| Sample balance | 0.25 | Equivalent to a maximum cohort ratio of 4:1. |
| Missing rate | 0.50 | More missing than observed is not evaluable. |
| Evaluation window | 365 days | Bound stale or accidental unbounded queries. |
| Replication periods | 2 non-discovery periods | One follow-up period is not replication. |
| Replication normalized effect | 0.10 per period | Each period must contain a meaningful directional effect. |
| Temporal stability samples | 3 per cohort per half-period | A single record in each half cannot establish stability. |
| Intervention adherence | 0.50 | An intervention is not evaluated when fewer than half of attempts were completed. |
| False-positive alpha | 0.05 | A statistical result must pass an exact one-sided test. Multiple comparisons use Bonferroni correction. |

Callers may request stricter values. Runtime normalization prevents API input, old persisted records, mobile clients, or test-only paths from weakening these floors.

## Stricter product defaults

Automatic candidate generation uses 5 samples per cohort, 12 total samples, a 0.20 normalized effect, a 0.30 balance, and at most 35% missing data. Practical self-understanding requires at least 8 records and keeps the 0.20 effect floor. A `stable_candidate` requires at least 12 complete pairs.

These defaults are stricter because generated findings are shown without a user first writing a precise comparison specification.

## Status behavior

- Insufficient sample count, imbalance, missingness, or effect returns an inconclusive or insufficient status.
- `supports` and `challenges` describe the direction of the observed records only.
- Replication excludes the discovery period and requires two usable later periods.
- A usable replication period must include at least 6 samples, a missing rate no higher than 0.50, a valid non-overlapping period, and a unique source fingerprint. This prevents copying the same window into both validation and replication.
- Numeric outcomes require an explicit minimum and maximum scale. The minimum practical effect is at least 10% of that scale, even if a caller supplies a smaller raw threshold.
- Automatic self-understanding comparisons use the versioned semantic pair allowlist when parameter roles are available. Generic domain utilities remain available for explicit technical comparisons.
- A configuration value below a floor is raised to the floor at execution time.
- `supports`, `challenges`, `supported`, and `challenged` require an exact one-sided binomial or permutation p-value at or below the corrected alpha. A p-value above the threshold is reported as inconclusive.
- The 5% value is a per-analysis error-control target under the test's exchangeability assumptions. It is not a guarantee that every future dataset has a measured false-positive rate below 5%.
- Stored specifications are validated on creation and defensively normalized during evaluation.

## Changing a threshold

Change shared floors in `packages/domain/src/evidencePolicy.ts`, update focused regression tests, and document the reason here. A threshold change that can alter an existing result must also change the relevant rule or generation version so cached or persisted results remain auditable.
## Specification register

The following register makes every shared floor auditable. The implementation
keys are defined in packages/domain/src/evidencePolicy.ts; the table records
their purpose and regression coverage.

| Key | Value | Meaning | Rationale | Verification |
| --- | ---: | --- | --- | --- |
| minimumSamplesPerCohort | 3 | Minimum usable records in each group | Prevent one or two records from deciding a direction | Domain, hypothesis, candidate, and experiment tests |
| minimumConclusionSamplesPerCohort | 21 | Minimum usable records per group for supports/challenges | Keep final conclusions away from small-sample extremes | Hypothesis and experiment conclusion tests |
| minimumTotalSamples | 6 | Minimum records across both groups | Keeps the two group floors consistent | Domain and hypothesis tests |
| minimumAbsoluteEffect | 0.10 | Minimum normalized/absolute effect floor | Ignore negligible differences | Evidence and candidate floor tests |
| minimumConclusionNormalizedEffect | 0.25 | Minimum normalized effect for supports/challenges | Separate exploratory candidates from final conclusions | Hypothesis and experiment conclusion tests |
| falsePositiveAlpha | 0.05 | Exact one-sided significance target | Keep positive conclusions behind a five percent gate | test/false-positive-rate.test.ts |
| maximumExactPermutations | 200000 | Exact test computation budget | Switch to deterministic Monte Carlo instead of dropping large datasets | Significance and candidate fallback tests |
| monteCarloPermutationSamples | 10000 | Approximate test sample count after the exact budget | Keep large comparisons evaluable with a conservative plus-one estimate | Significance fallback test |
| maximumMissingRate | 0.50 | Maximum excluded or missing proportion | Avoid conclusions dominated by absent data | Hypothesis and experiment tests |
| maximumWindowDays | 365 | Maximum evaluation window | Bound stale and accidental unbounded queries | Configuration validation tests |

The 3-observation and 0.10 floors are exploratory measurement-quality floors. Final `supports` and `challenges` additionally require 21 usable observations per cohort and a normalized effect of at least 0.25. The false-positive
target is controlled separately by the exact test; increasing a sample floor
alone does not guarantee a five percent false-positive rate. Candidate generation automatically counts the allowed condition/outcome comparisons and applies Bonferroni correction. Callers may provide comparisonCount to use a stricter explicit family size.

Temporal stability splits the observed timestamp range inside the configured
window, not the full unused lookback window. This prevents recent observations
from making the earlier half empty. The per-half, per-cohort minimum still
applies; insufficiently distributed observations remain `unknown`.

When the exact permutation count exceeds `maximumExactPermutations`, numeric
comparisons use a deterministic Monte Carlo permutation test with
`monteCarloPermutationSamples` draws and a plus-one p-value estimate. The
result records `monte_carlo_permutation` so consumers can distinguish an exact
result from an approximation. Binary and two-level outcomes continue to use
their exact calculation.

The candidate audit path records the number of comparisons that passed sample,
effect, balance, and missingness gates before significance testing, the number
rejected by significance, and the number accepted before the display limit.
This makes threshold changes reviewable instead of silently changing the
candidate list.
