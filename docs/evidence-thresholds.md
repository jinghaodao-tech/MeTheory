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
