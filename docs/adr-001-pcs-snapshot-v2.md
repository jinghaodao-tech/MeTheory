# ADR-001: PCS Snapshot V2 boundary

## Decision

MeTheory accepts only `pcs-analysis-snapshot-v2` at the analysis boundary. Snapshot content is validated before persistence and identified by a canonical SHA-256 hash. PCS remains the owner of records, templates, Markdown, and field privacy.

## Consequences

Fixture and Live requests share the same validation and repository path. A changed payload with the same user and snapshot ID returns `409 snapshot_id_content_mismatch`. Live retrieval is localhost-only and credentials are read from process environment.
