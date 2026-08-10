# ADR-012: PCS V3 Machine Measurement Boundary

## Status

Accepted, adapter implemented.

## Decision

MeTheory accepts PCS V2 and V3 snapshots at the binding boundary. V3 requires measurement metadata for `machine_measured` values and maps their source to `system`; `user_confirmed` remains `user_confirmed`.

The existing V2 analysis engine remains unchanged until the canonical PCS contract package is upgraded in the dependency lock. V3 validation is therefore available first at ingestion, while V3-to-analysis conversion is an explicit follow-up rather than an implicit downgrade.

## Rationale

Confirmation mode is evidence provenance, not merely a boolean review flag. Silently converting machine measurements into user-confirmed V2 values would misrepresent the source.
