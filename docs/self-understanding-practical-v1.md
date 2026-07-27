# Self Understanding Practical v1

## Purpose

Self Understanding turns confirmed, structured Entry values into small,
testable, non-clinical observations. It is not a medical, psychological, or
personality diagnosis feature.

## Analysis boundary

- Only `entry_field_values` with `reviewed_at` are analysed.
- The deterministic evaluator decides cohorts, counts, missingness, effect,
  stability, supporting Entries, contradicting Entries, and candidate status.
- The default gate requires eight Entries and three valid values in each group.
- A candidate can be an emerging tendency, a relatively stable candidate, or
  unstable. Insufficient data produces a shortage explanation instead of a
  hypothesis.
- No disease, disorder, diagnosis, probability, treatment, medication, or
  care recommendation is represented or stored.

## Explanation and AI

The standard Japanese explanation is deterministic and works when every AI
provider is disabled. It reports the observed conditions, counts, aggregate
values, uncertainty, counterexamples, and a 7-day recording experiment.

No note body, arbitrary SQL result, or database export is automatically sent to
an AI provider. A future local-only explanation provider may receive only the
validated `SelfUnderstandingInterpretationInput` DTO. It cannot change the
evidence direction, candidate state, or Entry references.

## Workflow

1. Open **Self Understanding** in the VS Code MeTheory view.
2. Choose one, two, or four weeks; optionally select a template and fields.
3. Analyse confirmed values.
4. Inspect the deterministic explanation and open supporting or contradicting
   Entries from the candidate card.
5. Rate the candidate as fits, does not fit, or on hold.
6. For a fitting candidate, edit the proposed Self Model sentence if needed.
7. Explicitly accept it to add an active Self Model belief. Rejection never
   adds a belief.

## Persistence

`hypothesis_reviews` records the rating, analysis period, template version, and
field pair. `self_model_candidates` retains the editable proposal and its
source period. Accepted candidates create a new `self_beliefs` row; existing
beliefs are not overwritten.

## Current limitations

Candidate generation is deterministic and comparison-based. It does not infer
causality, diagnose health conditions, or learn opaque personal weights. The
first version uses the built-in standard explanation rather than automatically
calling a local or external model.
