# PCS Snapshot V2

MeTheory accepts a validated `pcs-analysis-snapshot-v2` through `POST /v1/pcs/analyze`.
PCS remains the owner of records, Markdown, templates, field privacy, and profile data.
MeTheory stores the submitted snapshot only as local analysis metadata, with a deterministic SHA-256 content hash and contract revision.

`POST`, `GET`, and `DELETE /v1/pcs/profile-binding` bind one local MeTheory user to one PCS profile. A mismatched submitted profile returns `409 pcs_profile_mismatch`. Reusing a snapshot ID with changed content returns `409 snapshot_id_content_mismatch`.

`GET /v1/pcs/analysis-history` and `GET /v1/pcs/analysis-runs/:runId` expose local run metadata. Candidates remain review aids: they do not diagnose, create experiments, or modify the Self Model without explicit user action.

The local closed loop is exposed through `POST /v1/pcs/experiment-draft`, draft acceptance, experiment start, observation, transition, and evaluation endpoints. Evaluation returns deterministic group counts, missingness, effect difference, and the user-approved Self Model actions `create_new`, `propose_update`, and `keep_separate`.

After an experiment is evaluated, `POST /v1/pcs/experiments/:id/self-model-candidate` can create one *proposed* Self Model candidate. It requires a user-written statement and never creates or updates a Self Belief by itself. The existing `POST /v1/self-understanding/self-model-candidates/review` endpoint remains the only acceptance or rejection step, and records that decision in the normal Self Model history.

Live PCS retrieval is intentionally disabled until a localhost-only PCS client is configured; the API returns `501 pcs_live_client_not_configured` instead of silently falling back to fixture data.
