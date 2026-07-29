# Personal Context Studio Boundary

MeTheory remains the system for Entries, structured observations, deterministic
hypothesis evaluation, Evidence, and user-reviewed self-understanding. It does
not become an AI personal-profile store.

`extracted/personal-context-studio` is a separately installable, local-only
application for user-confirmed AI context. It owns context templates, values,
sharing preferences, export profiles, AI-oriented exports, import decisions,
and safe deletion.

The systems communicate only through
`personal-context-candidate-v1` JSON. MeTheory exposes a read-only migration
export with `metheory personal-context export-migration --json` and can produce
a reviewed hypothesis candidate with `metheory self-understanding
context-candidate export <candidate-id> --json`. No Personal Context Studio
table, template, or profile is imported at runtime by MeTheory.

An imported item is always pending. The user must explicitly accept, edit and
accept, hold, or reject it before it becomes usable context. `private`,
`never`, and `highly_sensitive` values are excluded from every export.
