# Hypothesis Evaluation

MeTheory does not label an individual Observation as support or challenge. A
Hypothesis is evaluated by comparing multiple ObservationEpisodes under a
versioned HypothesisSpec.

## Spec

`HypothesisSpec` fixes the unit (`response`), scope conditions, exactly two
cohorts, an outcome metric, an expected direction, and a data-quality policy.
Supported metrics are `binary_rate_difference` and
`numeric_mean_difference`. Conditions support equality, numeric comparisons,
and membership operators.

## Episodes and provenance

Observations sharing a `response_id` form one ObservationEpisode. For a field,
the evaluator selects the highest-priority source in this order:
`user_confirmed`, `system`, `ai_inferred`; ties use the latest observation from
that source. Capture mode, source, certainty, and missing values remain
available for filtering and audit.

## Results

- `insufficient_data`: minimum samples, cohort balance, or missing-rate policy fails.
- `supports`: the observed difference reaches the expected direction and minimum effect.
- `challenges`: the observed difference reaches the opposite direction and minimum effect.
- `inconclusive`: data is sufficient, but the effect is smaller than the threshold.

Statistical guardrails also apply. A directional result must pass an exact
one-sided permutation test for cohort comparisons (or an exact binomial test
for the legacy directional evidence path) at alpha `0.05`. When a caller
provides `comparisonCount`, Bonferroni correction uses `0.05 / comparisonCount`.
If the exact calculation exceeds the configured computation budget, the result
is kept non-positive rather than approximated.

The management state (`proposed`, `tracking`, `paused`, `archived`) is separate
from the evaluation result. Every evaluation stores the spec version, evaluator
version, time window, cohort metrics, quality flags, and included/excluded
episode samples. The API exposes creation, latest evaluation, evaluation, and
evaluation-history endpoints under `/v1/hypotheses`.

The legacy `evidence_links` table remains for compatibility with earlier data,
but new comparison evaluations do not create links to individual observations.
