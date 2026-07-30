# Closed-loop experiments

MeTheory turns a confirmed self-understanding candidate into a small,
user-approved observation loop:

1. inspect a candidate and its supporting or contradicting records;
2. create an editable experiment draft;
3. accept the draft explicitly;
4. collect only the required experiment observations;
5. pause, resume, complete, or cancel the experiment;
6. run the deterministic evaluator;
7. inspect evidence, data quality, adherence, and sensitivity;
8. review the original hypothesis and decide separately whether Self Model
   should change.

An experiment is a testable comparison, not a recommendation, diagnosis, or
causal claim. Behavioral intervention records whether the proposed action was
actually attempted. A low adherence rate produces insufficient_data, not an
effectiveness failure.

The evaluator returns supported, challenged, mixed, inconclusive,
insufficient_data, or invalid. Evaluation records are append-only so that the
original candidate and previous experiments remain visible.

Entries remain free records. They are not silently converted to experiment
observations. A check-in must be explicitly linked to an experiment, and
experiment responses store typed, user-approved observation metadata only.

PCS is independent. A shortage may produce a generic pending template request,
but MeTheory does not activate a PCS template or write a confirmed PCS value.
