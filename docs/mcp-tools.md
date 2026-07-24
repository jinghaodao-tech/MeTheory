# MCP boundary

The read-only MCP boundary maps to the same service methods as the AI API:
`list_parameters`, `get_parameter_definition`, `get_self_model`,
`list_hypotheses`, `get_hypothesis`, `get_hypothesis_evidence`,
`get_missing_parameters`, `query_parameter_aggregates`, and `get_ai_snapshot`.

Tools accept structured inputs only. They do not accept SQL, file paths, raw
provider tokens, or write operations. Every tool call must pass the same
parameter policy, user setting, period, client, and purpose checks as the local
AI Snapshot service and must create an audit record.
