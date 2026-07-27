# Entry Template System

Entry Templates are local SQLite definitions for reusable, human-approved records. AI is allowed to create a draft only; it never writes the database directly. The user edits and approves the draft before `POST /v1/templates` persists it.

Each saved template has immutable versions and fields. Entries retain the `template_version_id` used at creation, so changing a template does not rewrite history. Field values are typed and are stored separately from the human-readable Entry body. They are not automatically converted into observations or `parameter_values`.

`POST /v1/templates/:id/entries` validates required fields, types, ranges, and choices, then writes the Entry and all field values in one SQLite transaction. A failure rolls back the complete operation. Archived templates remain available to existing Entries but are omitted from the normal list.

The current provider boundary includes deterministic Mock and disabled providers, a
manual ChatGPT copy/paste workflow, and an optional OpenAI API provider. External
AI is never contacted automatically: a user chooses the provider and approves a
draft before it can be used. A local or disabled provider remains sufficient for
the core flow. Sensitive field values are not added to search documents by default.
Obsidian can call the draft endpoint, let the user approve and edit it, then reuse
saved templates offline through the local API.

Adding a template or field does not require a schema change. Only the template tables are migrated; existing Entries, observations, hypotheses, and search documents remain intact.
