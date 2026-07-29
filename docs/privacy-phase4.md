# Privacy and Safe Delete Phase

> Historical implementation note. Document, template-field, and external-AI
> transfer consent now belong to Personal Context Studio. This document remains
> relevant only to MeTheory-owned experiment, evidence, and Self Model privacy.

## Field policy

Template fields keep the compatible `sensitivity` column and add
`sensitivity_level`, `classification_source`, and `prohibited_secret_risk`.
The levels are `normal`, `sensitive`, and `highly_sensitive`; prohibited
secrets such as passwords and API keys are rejected rather than classified as
storable data. `suggestFieldPrivacy` is deterministic and detects likely
credentials as well as personal health, medication, financial, relationship,
exact-location, third-party, and highly identifying fields. General private
records are `sensitive`; exact addresses, identifying medical detail,
third-party secrets, and severe harm information are `highly_sensitive`. AI
classifications cannot be persisted until the user confirms them.

Fields that look like passwords, API keys, tokens, session cookies, or recovery
secrets are rejected at template persistence. Secret-shaped values are rejected
again at Entry and extraction persistence. This is code-based, not AI-only.

## Consent

`privacy_consents` is append-oriented consent history. Sensitive processing and
external AI transfer are separate consent types. External transfer requires a
provider ID and a destination fingerprint made from provider, host, connection
type, and optional profile ID. The fingerprint is one-way; API keys and cookies
are never persisted.

Sensitive storage checks active field consent in both the Entry and extraction
repositories. Revocation prevents future processing but does not silently
delete already stored values. External AI callers must run the destination
fingerprint check before sending a field value.

`highly_sensitive` values require explicit `highly_sensitive_downgrade` consent
and are recorded in `privacy_value_overrides` as sensitive. The same consent
can create a new immutable template version with the field at `sensitive`; the
original version remains unchanged. Prohibited secret-risk fields cannot be
downgraded.

## Safe delete

`POST /v1/privacy/safe-delete/plan` counts current values, historical values,
value overrides, extraction corrections, search documents, backups, and
Markdown matches. It stores a generated exact confirmation string.

`POST /v1/privacy/safe-delete/execute` requires that exact string and deletes
SQLite values, overrides, correction history, and Entry search documents in one
transaction. Other users and other `source_kind` values are not touched. The
CLI removes only current-workspace backup manifests/files after successful
execution, so an old full-database backup cannot retain the deleted value.

Markdown is never automatically edited or deleted. The plan reports matching
paths, counts, and a short `[REDACTED]` preview as `review_only`. Audit events
retain only operation type, category, count, and time, and can be listed via
the audit endpoint or CLI.

## API and CLI

The Node API provides privacy status, consent list/show/grant/revoke, audit
events, protected fields, external-AI checks, immutable field downgrade, and
safe-delete plan/status/execute endpoints.

The CLI mirrors these through `privacy status`, consent, fields, `audit list`,
and `privacy safe-delete plan|status|execute`. Extraction review can pass an
explicit `fieldKey=consentId` override. VS Code includes the Privacy view and
consent/safe-delete commands.

All privacy tables and field columns are created idempotently by the SQLite
schema and API startup migration. Existing Entry, Template, Entry Field Value,
extraction, search, Markdown, and backup records are not silently removed by
migration.
