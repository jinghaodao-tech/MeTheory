# Local AI and Review Phase

> Historical implementation note. The record-facing providers, runtime manager,
> extraction workflow, review flow, and record-content external-AI consent now
> live in Personal Context Studio. MeTheory retains only its bounded analysis
> wording provider, which receives no Markdown bodies.

This phase keeps AI execution explicit and local-first.

## Providers

`packages/ai-core` exposes `MockAiProvider`, `ManualExternalAiProvider`,
`OllamaAiProvider`, `OpenAICompatibleLocalProvider`, and
`DisabledAiProvider`. The provider is selected from workspace configuration or
environment variables. Disabled is the safe default. The local providers use
an OpenAI-compatible `/models` health check and `/chat/completions` request;
the provider still validates the returned template or extraction JSON.

Manual mode does not automate ChatGPT. It stores a prompt containing the JSON
schema, lets the user copy it to an external desktop application, and requires
the pasted result to pass domain validation before it can become a draft.

## Runtime lifecycle

`packages/local-ai-runtime` detects Ollama and generic local endpoints. A
custom runtime can be started only from an explicit executable path and an
argument array with `shell: false`. It has single-flight start state and does
not search for or terminate unrelated processes. The workspace default idle
timeout is 15 minutes; external runtimes can also be managed by their own
applications.

## Draft and extraction flow

Template generation and natural-language extraction write review records under
`templates/drafts`. A template draft is not persisted to the template tables
until approval. Extraction records store Entry ID, template version, source
content hash, source update time, provider/model metadata, values, confidence,
and review status. Re-extraction is explicit. If the source content hash no
longer matches, application is rejected as stale.
Confidence is normalized to `0..1`: values at or above `0.85` are suggestions,
`0.60..0.85` require review, and lower confidence is treated as unanswered.
Confidence never grants final approval by itself.

An Entry is eligible for structuring only when its Markdown frontmatter has
`tracked: true`, `auto_structure: true`, and an approved `template_version_id`.
Only those workspace notes are structured after the save debounce; ordinary notes
never invoke an AI provider. The CLI and VS Code commands are
still explicit user actions; no background watcher sends note content to an AI.

The API startup migration adds nullable extraction provenance columns to the
existing `entry_field_values` table with idempotent `ensureColumn` calls. No
existing Entry, observation, hypothesis, or parameter-value row is deleted.
After a review, the CLI calls `POST /v1/entries/:entryId/extraction/apply`.
The repository checks the user boundary, template fields, typed values, and
allowed choices inside one SQLite transaction before updating provenance.

## Privacy boundary

The implementation does not automatically send note content to a cloud
provider. API keys remain environment-only. Logs contain command status and
error codes, not note bodies, prompts, generated results, or sensitive values.
Entry extraction remains a review surface and is not an implicit conversion to
`observations` or `parameter_values`.

## Verification

Run `npm.cmd run verify`. Phase-specific tests cover provider validation,
disabled/manual behavior, unavailable local runtimes, runtime start failure,
source hash tracking, stale-result rejection, and successful reviewed apply.
