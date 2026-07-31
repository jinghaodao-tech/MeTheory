# ADR-003: Explicit candidate pair allowlist

## Context
Free-form labels are not sufficient evidence of a valid semantic comparison.

## Decision
Candidate generation on the PCS path requires `candidate-pair-v1` and an explicit condition/outcome role pair. Unknown, unconfirmed, excluded, or incompatible fields are omitted with a visible reason.

## Alternatives
Infer roles from labels; compare every pair; let an AI choose pairs.

## Consequences
Fewer candidates, but each candidate is explainable and reproducible.

## Reversal
Publish a new allowlist version with tests and a data review; never change the meaning of an old version.