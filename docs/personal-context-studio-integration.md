# Personal Context Studio Integration

Personal Context Studio is the local record and context system for MeTheory.
It owns Markdown-facing document registration, local search, local-AI extraction
candidates, candidate review, and long-form recording templates. MeTheory does
not open the Personal Context Studio SQLite database and does not receive
Markdown bodies for self-understanding analysis.

## Data flow

1. A VS Code, Obsidian, or other local connector writes a document to Personal
   Context Studio.
2. Personal Context Studio stores the local document, searches it locally, and
   may create unconfirmed structured candidates from a local AI result.
3. The user confirms or edits individual values.
4. MeTheory requests `GET /v1/metheory/analysis-snapshot` from the local PCS
   API and analyzes only confirmed, shareable, non-highly-sensitive values.
5. Evidence keeps the Personal Context Studio entry ID as its source reference.

The snapshot contract is `pcs-analysis-snapshot-v1`. It is an HTTP boundary,
not a shared SQLite schema or a database copy.

## Experiments

MeTheory creates short experiments directly when a few check-ins and values are
enough. For a long journal, multi-section reflection, or a complex recording
flow, MeTheory posts a `pcs-experiment-template-request-v1` request to PCS.
PCS creates a draft template. It remains inactive until the user reviews and
activates it, then its confirmed values can appear in a later analysis snapshot.

## Safety

Both services accept only `localhost`, `127.0.0.1`, or `::1` for this
integration. PCS excludes unconfirmed values, `private` or `never` sharing,
and `highly_sensitive` fields from the analysis snapshot. It does not expose
search results or document bodies to an AI unless a caller requests a bounded
local search result under the user's configured policy.

## Legacy direct integrations

The former MeTheory VS Code, Obsidian, template, extraction, and Entry APIs
are development-era implementations. They are not the product integration
surface. New connector and local-AI work belongs in Personal Context Studio.
