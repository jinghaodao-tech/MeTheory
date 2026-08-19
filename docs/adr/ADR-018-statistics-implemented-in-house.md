# ADR-018: Implement statistical tests in-house and verify against an external reference

## Status

Verification run and candidate-selection correction completed (2026-08-19);
see `docs/spec/significance-scipy-verification.md`. The unexplained `4 *`
factor in continuous exact and Monte Carlo p-values was removed. The resulting
selection bias in candidate generation is controlled by a four-way selection
adjustment, and the null false-positive tests now pass.

## Context

MeTheory computes p-values for candidate hypotheses using an exact permutation
test, an exact binomial test, and a Monte Carlo permutation fallback. All of
these are implemented in `packages/domain/src/significance.ts` with no external
dependency. The repository currently declares only `personal-context-studio`
and `pg` as runtime dependencies, and `@types/node` and `typescript` as dev
dependencies. The test runner is the Node built-in `node:test`.

Mature implementations of these tests exist. `scipy.stats.permutation_test`
and `scipy.stats.binomtest` are widely used and independently validated. They
are not available here because MeTheory runs on Node, and the available
JavaScript statistics libraries do not cover exact permutation testing with a
combinatorial guard and a deterministic Monte Carlo fallback.

The risk is specific: permutation tests fail silently. A wrong one-sided /
two-sided convention, an incorrect tie rule, a `>` where `>=` is required, or a
missing plus-one correction in the Monte Carlo estimate all produce a p-value
that looks plausible. Nothing crashes and no test fails. The current
implementation has no evidence of correctness beyond its own unit tests, which
were written against the same understanding that produced the implementation.

## Decision

Keep the in-house implementation. Add an external verification step that is
run manually and recorded, not wired into `npm run verify`.

1. A verification script generates synthetic group pairs across a parameter
   grid: group sizes from 3 to 20, effect sizes from 0 to 1, and both
   directions.
2. For each case, the p-value from `exactPermutationPValue` /
   `exactBinomialPValue` is compared against `scipy.stats.permutation_test` and
   `scipy.stats.binomtest` on identical inputs.
3. Exact paths must agree to within floating-point tolerance. The Monte Carlo
   path must agree within its sampling error for the configured draw count.
4. The result — date, scipy version, number of cases, maximum observed
   difference — is recorded in `docs/spec/`. A disagreement is treated as a
   defect in the in-house implementation, not as a tolerance to widen.

This verification is repeated whenever `significance.ts` changes.

## Alternatives

- **Depend on a JavaScript statistics library.** Rejected. The available
  options do not provide exact permutation testing with the combinatorial guard
  and deterministic fallback this product needs, and adding a dependency for
  partial coverage would leave the remaining paths unverified anyway.
- **Move the analysis layer to Python to use scipy directly.** Rejected. The
  PCS integration contract, the snapshot validation, and the candidate pipeline
  are TypeScript. Splitting the runtime for one module would add a process
  boundary and a serialization step to the most correctness-sensitive part of
  the system.
- **Accept the in-house implementation without external verification.**
  Rejected. This product's claim is that its conclusions are grounded. A
  p-value that has never been checked against an independent implementation is
  not grounded, and the failure mode is silent.
- **Wire the scipy comparison into CI.** Rejected for now. It would require a
  Python toolchain in the verification pipeline of a Node project. The
  comparison is run on change, not on every commit, and the result is recorded.

## Consequences

- Correctness of the significance layer rests on a recorded external
  comparison rather than on the implementation alone.
- The zero-dependency posture is preserved and becomes a deliberate position
  rather than an unexamined default.
- A Python toolchain is required to re-run the verification. This is acceptable
  because it is a development-time activity, not a runtime dependency.
- If scipy and the in-house implementation disagree, the in-house
  implementation is wrong until proven otherwise.

## Reversal

If the verification repeatedly finds discrepancies that are not attributable to
implementation defects, or if the maintenance cost of the in-house tests
exceeds the cost of a process boundary, move the significance layer to a
Python service and call it over localhost. The snapshot contract already
demonstrates that a versioned local boundary is workable.
