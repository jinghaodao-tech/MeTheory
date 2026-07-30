# Closed-loop experiment implementation plan

## Current flow

Confirmed PCS values are read by the existing self-understanding analysis.
The deterministic candidate generator compares allowlisted parameters and
stores candidate history. A user can now create an experiment draft from a
candidate, edit it, and explicitly accept it. Accepted experiments use the
existing check-in, observation episode, parameter value, notification, and
evaluation boundaries. Results are stored as append-only evaluations and are
not applied to Self Model automatically.

## Reused capabilities

- packages/domain/src/hypothesis validates and evaluates existing hypotheses.
- packages/self-understanding generates non-diagnostic candidates and evidence.
- Mobile EAV storage, hypothesis_parameter_requirements, generated questions,
  check-in budgets, and transaction-based response saving are reused.
- The existing Node API owns SQLite access and user-scoped repositories.
- PCS remains an independent product. MeTheory uses only candidate snapshots and
  the generic template-request boundary.

## Added capabilities

- Closed-loop experiment drafts and a guarded lifecycle.
- Condition comparison, behavioral intervention, and observation-only metadata.
- Deterministic evaluation with evidence IDs, adherence, data quality,
  alternative explanations, and sensitivity explanations.
- Data collection plans that may contain a pending PCS template request.
- Hypothesis review reasons as explicit, explainable rules.
- Self Model freshness records and explicit review actions.

## Storage and migration

The Node API schema is extended idempotently in db/ts_mvp_schema.sql.
db/closed-loop-experiments-migration.sql contains standalone migration
statements for an existing local database. Expo SQLite uses migration 16 and
adds experiment_id to check-ins and observation episodes.

No Entry body is copied into experiment tables. Only explicit observations and
their provenance are persisted.

## API and UI

The API provides draft creation, edit, accept/reject, experiment lifecycle,
questions, responses, evaluation, collection plans, and Self Model review
endpoints. The mobile app adds an Experiments view and a "try this hypothesis"
action on candidate cards. A mobile response becomes an experiment observation
only when the check-in is explicitly linked to an experiment and includes a
typed group and outcome.

## Migration and compatibility

Existing hypotheses, check-ins, responses, observations, Entries, Evidence,
candidate history, and Self Model rows are preserved. The new tables are
additive and can be applied more than once. Existing candidate adoption and
legacy hypothesis evaluation continue to use their original paths.

## Test plan

Domain tests cover draft generation, transitions, invalid transitions,
evaluation, adherence, shortage, review reasons, freshness, and sensitivity.
Repository tests cover idempotent schema creation, user isolation,
transactional lifecycle, evaluation, and pending PCS requests. Mobile
typechecking validates the Expo integration.

## Implementation status

The deterministic domain, Node repository/API, mobile migration/repository,
candidate-to-experiment UI action, documentation, and focused tests are
implemented. Native notification scheduling for experiment-specific questions,
full field-level experiment editing UI, and live PCS network delivery remain
follow-up work; the request object is intentionally left pending for user
approval.
