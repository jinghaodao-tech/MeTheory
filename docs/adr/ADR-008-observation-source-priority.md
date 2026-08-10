# ADR-008: Preserve both user and system observations

## Decision

When multiple observations exist for the same field and episode, the evaluator
uses user_confirmed first, then system, then ai_inferred. Ties use the latest
observation from that source. This is intentional product behavior, not an
assertion that self-report is objectively more accurate.

The raw observation provenance remains append-only. A system value is never
deleted or overwritten by a user value, and a user value is never silently
replaced by an AI inference. Future analysis may expose disagreement between the
user and system values as a separate observation, but it must not hide the two
sources by choosing one at ingestion time.

## Rationale

MeTheory analyzes self-understanding. The user's confirmed interpretation is
therefore the primary answer for a subjective construct, while deterministic
system measurements remain available for audit and future discrepancy analysis.
The priority is scoped to selecting an evaluation value; it does not authorize
AI to decide facts or evidence strength.

## Consequences

- Evaluation results are reproducible because the priority and tie-break rule are versioned and documented.
- Source disagreement remains inspectable in the underlying observations.
- A future discrepancy feature can be added without changing historical raw records.
