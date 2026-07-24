# Source Adapters and AI Access

MeTheory uses a provider-neutral `SourceAdapter` interface. Adapters return
external records; they do not write SQLite directly. The registry resolves
providers, while the import repository performs mapping, validation,
deduplication, episode creation, and transaction storage.

Implemented local providers are `system_clock`, `test_fixture`, and
`manual_import`. External providers can be added by implementing the adapter,
registering it, and registering `ExternalParameterMapping` entries. Supported
transformations include unit conversion, enum mapping, duration calculation,
and record counts. Custom transforms must be resolved from code, never loaded
as arbitrary database code.

Import batches and items are recorded in SQLite. External values use
`source_provider`, `external_record_id`, and `transformation_version`; a
unique index prevents re-importing the same transformed value. Raw external
fields are not stored in `parameter_values`.

`exportAiSnapshot` and `queryAiParameterAggregates` are read-only local APIs.
The Node API exposes the same boundary at GET /v1/ai/* and POST
/v1/ai/aggregates/query with an allowlisted client ID.
They require both the parameter policy and the user's `external_ai_enabled`
setting, return aggregate data only, enforce a 90-day window, and write every
request to `ai_access_audit_logs` or the API audit table. OpenAI access is
optional and runtime-only; OAuth, calendar, health, and cloud integrations
still require a platform bridge and are not enabled by default.
