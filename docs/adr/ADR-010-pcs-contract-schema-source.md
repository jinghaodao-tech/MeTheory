# ADR-010: The official PCS package owns the analysis contract

The installed `personal-context-studio/integration-contracts` package is the
single source of truth for the PCS analysis snapshot shape, schema version, and
contract revision. MeTheory imports its runtime validator and version constants
at the API and analysis boundaries.

The former `schemas/pcs-analysis-snapshot-v2.schema.json` duplicated part of the
wire contract and could drift from the official package. It was removed because
it was not used by the runtime or verification scripts. Fixtures may continue to
contain concrete snapshot examples, but they are validated through the official
package rather than through a second local schema.