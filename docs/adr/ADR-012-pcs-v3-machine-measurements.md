# ADR-012: PCS V3 Machine Measurement Boundary

## Status

Accepted, adapter implemented.

## Decision

MeTheory accepts PCS V2 and V3 snapshots at the analysis boundary. V3 requires measurement metadata for `machine_measured` values and maps their provenance to `system`; `user_confirmed` remains `user_confirmed`.

The V3 adapter in `packages/self-understanding/src/pcsSnapshotAnalysis.ts` explicitly converts validated V3 values into the internal analysis record shape. It preserves the mapped provenance and `sourceTool`, so the analysis engine can distinguish machine measurements from user-confirmed values and disclose shared measurement-definition confounding. V2 remains supported for compatibility; V3 is not silently downgraded at ingestion.

## Rationale

Confirmation mode is evidence provenance, not merely a boolean review flag. The explicit V3 adapter prevents machine measurements from being represented as user-confirmed values while allowing the existing candidate engine to analyze both snapshot versions.
