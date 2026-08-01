# ADR-001: PCS Analysis Boundary

MeTheory consumes the official `personal-context-studio/integration-contracts` package for PCS analysis snapshots. Legacy local contract types may remain in historical tests, but primary analysis, repository, and API paths must not import them.

PCS remains the source of truth for records and approved values. MeTheory stores analysis runs, candidate hypotheses, evidence references, and user review state only.
