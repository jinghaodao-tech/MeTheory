# ADR-011: Large-sample significance fallback and candidate audit

## Context

Exact permutation tests grow combinatorially. With 20 observations in each
cohort, enumerating every assignment is not practical. Returning `null` at
that point caused candidate generation to discard a comparison merely because
more data had been collected. The significance gate also needs an auditable
answer when a candidate passes the measurement-quality gates but is rejected by
the statistical threshold.

## Decision

Keep exact permutation testing through 200,000 assignments. Above that limit,
use a deterministic Monte Carlo permutation test with 10,000 draws and a
plus-one p-value estimate. Store the method as
`monte_carlo_permutation`; do not present it as an exact result. Binary and
two-level outcomes use the exact hypergeometric calculation and do not need the
fallback.

Expose a read-only candidate generation audit containing:

- comparison family size used for Bonferroni correction;
- candidates passing sample, effect, balance, and missingness gates;
- candidates rejected by significance;
- accepted candidates before the display limit.

The normal candidate API always keeps the significance gate enabled. The audit
does not provide a way to disable it.

For continuous numeric outcomes, the effect gate uses a Cohen's d-style
standardized mean difference: the absolute difference of cohort means divided
by their pooled sample standard deviation. It does not use the declared
minimum/maximum value range, because a broad administrative range such as
0-1440 minutes would make the same observed difference appear artificially
small. Boolean and categorical outcomes retain their existing rate-based
effect treatment. If both cohorts have zero within-group variance, a non-zero
separation is treated as maximally standardized; a zero separation remains
zero. Numeric permutation p-values are conservatively multiplied by four to
account for the two-sided direction choice and exploratory temporal-window
selection; the value is capped at one. Binary and categorical p-values retain
their original one-sided behavior.

## Controlled evidence

The regression fixture with one effect-qualified but weakly significant numeric
comparison records `1` pre-significance candidate, `1` significance rejection,
and `0` accepted candidates. A 40-observation clear-effect fixture remains
available through the Monte Carlo fallback and records that method explicitly.

These are controlled tests, not evidence about real users. A real-data run is
required after PCS provides reviewed Markdown-derived entries.

## Temporal stability window

Temporal stability splits the intersection of the configured evaluation window
and the observed timestamps for the candidate, rather than splitting the entire
lookback window. Splitting a 30- or 365-day window when all records were
captured in its last few days leaves the first half empty and makes stability
`unknown` regardless of sample size. A candidate with eight records remains
`unknown` when each half cannot supply three records per cohort; candidates with
12 and 100 evenly distributed records are covered by regression tests and can
become `stable`. A period with enough observations but near-zero effect is a
valid `0` effect for stability comparison; it is not treated as missing. The
`effect_reversal` and `temporary_effect` scenarios therefore produce
`unstable`, while clear positive and negative scenarios produce `stable`.

## Real machine-measurement audit

The first dev-pace run used PCS V3 and contained 55 records and 330 usable
machine-measured values. Its audit contained 27 comparisons across three
machine-measurement role families and 24 derived hourly comparisons. No
comparison passed the effect gate (`preSignificanceCandidates: 0`), so the
result was insufficient evidence rather than a data-transport failure. The
hourly vector is retained separately as a machine-measured
`hourly_active_minutes` field and is excluded from the normal raw-value
candidate pool.

The vector uses `Asia/Tokyo` calendar boundaries by default. MeTheory expands
its 24 elements into derived `time_of_day` observations for exploratory
analysis, while retaining the raw vector provenance and keeping the vector
itself out of direct numeric candidate scoring.

## Cohort split strategy

Cohort boundaries are configurable per parameter: `range_midpoint` preserves
the declared-scale midpoint for bounded ratings, `observed_median` uses the
median of observations in the analysis window for continuous measurements,
and `fixed_threshold` supports a documented domain threshold. PCS continuous
machine measurements use `observed_median`; this prevents a 0-1440 minute
administrative range from placing nearly every day in the same cohort. The
selected strategy and observed values remain part of the candidate parameter
definition so the boundary can be reproduced for the same snapshot.
