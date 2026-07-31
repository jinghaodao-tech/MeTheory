# Experiment API

All routes require a user ID in the existing local development API contract.
Every repository query scopes by that user ID.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /v1/self-understanding/:candidateId/experiment-draft | Create a draft |
| GET/PATCH | /v1/experiment-drafts/:id | Read or edit a draft |
| POST | /v1/experiment-drafts/:id/accept | Explicitly create a ready experiment |
| POST | /v1/experiment-drafts/:id/reject | Reject a draft |
| GET | /v1/experiments | List user experiments |
| GET | /v1/experiments/:id | Read an experiment and latest evaluation |
| POST | /v1/experiments/:id/start | Move ready to active |
| POST | /v1/experiments/:id/pause | Pause an active experiment |
| POST | /v1/experiments/:id/resume | Resume a paused experiment |
| POST | /v1/experiments/:id/complete | Finish collection |
| POST | /v1/experiments/:id/cancel | Cancel collection |
| GET | /v1/experiments/:id/questions | List deterministic required questions |
| POST | /v1/experiments/:id/responses | Store an explicit typed observation |
| POST | /v1/experiments/:id/evaluate | Evaluate a completed experiment |
| GET | /v1/experiments/:id/evaluations | Read the latest evaluation |
| POST | /v1/collection-plans | Persist a data collection plan |
| GET | /v1/collection-plans/:id | Read a collection plan |
| POST | /v1/collection-plans/:id/accept | Accept a plan |
| POST | /v1/collection-plans/:id/pcs-template-request | Preview a pending generic PCS request |
| GET | /v1/self-model/review-due | List freshness items needing review |
| POST | /v1/self-model/:beliefId/review | Record an explicit freshness action |

There is no endpoint that automatically updates Self Model. Invalid IDs,
invalid state transitions, non-finite outcomes, unsupported sources, and
cross-user access are rejected.

`POST /v1/experiments/:id/responses` accepts an optional `idempotencyKey`.
Retries with the same key return the originally stored observation and do not
create a duplicate row. This is the client boundary for offline retry safety.

## Validation and audit rules

All mutation routes require `userId`, verify the referenced record belongs to
that user, and reject invalid lifecycle transitions before writing. Observation
sources and numeric outcomes are allowlisted. Timeline and review records are
append-only; the original candidate and previous evaluations are not replaced.
The aliases `POST /v1/hypotheses/:id/review` and `GET
/v1/hypotheses/:id/timeline` provide the hypothesis-oriented API described by
the domain specification while preserving the existing self-understanding
review routes.
