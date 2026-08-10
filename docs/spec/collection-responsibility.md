# Collection and Interpretation Responsibility

MeTheory uses one explicit boundary:

> The user chooses the scope of collection. The system chooses when to collect.
> AI proposes how to explain the result. The system decides what was observed
> and how evidence changes a hypothesis.

## User controls

- permission to notify
- broad allowed time ranges
- quiet ranges
- daily notification limit and channel importance
- answer, snooze briefly, or skip

The user does not set an exact daily notification time, choose the current
hypothesis for every check-in, or add a retrospective record as if it were a
momentary observation.

## System controls

- concrete collection minute inside allowed windows
- question selection and notification kind
- cooldown, quiet-hours, and daily/hourly budget enforcement
- persistence, aggregation, evidence direction, confidence, and hypothesis status
- consent, retention, deletion, export, and AI output validation

The notification kinds are `RANDOM_CHECK_IN`, `HYPOTHESIS_CHECK_IN`, and
`FOLLOW_UP_CHECK_IN` at the product language layer. The database uses the
lower-snake-case values `random`, `hypothesis`, and `follow_up`.

## Capture modes

Every response carries one of these modes:

- `momentary_observation`: collected at a system-selected check-in time
- `retrospective_entry`: entered later by the user and never silently treated as a momentary observation

## Three presentation layers

```text
Observed Fact          -> deterministic counts and comparisons
Bounded Interpretation -> approved rule/template wording
Hypothesis Candidate   -> candidate from a template or constrained AI output
```

These layers are stored separately. A candidate cannot update a Hypothesis,
Self Model, evidence count, notification schedule, or observed fact. If AI
validation fails, the UI uses a fixed neutral fallback.

## Forbidden AI behavior

AI cannot diagnose, assert personality, add unobserved motives or numbers,
reverse comparison direction, claim causality, choose notification timing,
change a hypothesis status, or write a confirmed observation. The system owns
those decisions and records the rule version used.
