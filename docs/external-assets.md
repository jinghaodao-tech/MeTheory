# External Assets and Self Understanding

This document describes the local-only integrations added to the current
MeTheory implementation. They are observation aids, not diagnostic systems.

## Structured local AI output

Self-understanding explanations use the versioned
`SelfUnderstandingInterpretationV3` JSON Schema. The response is checked for
strict fields, types, length, experiment duration, allowed field keys, Entry
references, non-clinical wording, construct, semantic role, and tendency scope.
The existing semantic validator runs after the schema check. Invalid output is
discarded and deterministic Japanese wording is used instead. Local providers
receive aggregate values and allowlisted Entry references, never Markdown
bodies. The endpoint must be loopback (`localhost`, `127.0.0.1`, or `::1`).

## ActivityWatch

ActivityWatch is an optional REST adapter for a locally running instance. It is
disabled by default (`ACTIVITYWATCH_ENABLED=true` is required) and only loopback URLs are accepted. Use the API or CLI to
check status, list buckets, preview a period, and import only after explicit
confirmation:

```text
metheory activitywatch status
metheory activitywatch buckets
metheory activitywatch preview --bucket=aw-watcher-window --from=2026-07-01T00:00:00Z --to=2026-07-02T00:00:00Z
metheory activitywatch import --bucket=aw-watcher-window --from=2026-07-01T00:00:00Z --to=2026-07-02T00:00:00Z --confirm
```

Only normalized category, duration, time, semantic role, and an explicitly
allowed project label are stored. AFK is excluded. Full browser URLs, titles,
chat, keystrokes, email subjects, file bodies, and raw bucket payloads are not
stored. ActivityWatch data means observed application activity or continuation;
it does not mean focus, productivity, or satisfaction.

## Baseline self-perception

The initial ten short items are original Japanese paraphrases inspired by the
IPIP domain, not copied official items and not an official IPIP score. They are
stored separately from observed behavior with `itemSetVersion`, source,
response scale, provenance, confirmation, and a user-controlled
`useForSelfUnderstanding` flag. Users may answer later, edit progress, disable
use, or delete all responses. A baseline is a self-perception reference and
must not be presented as a fixed personality label or diagnosis.

## Questions and charts

Generated or template questions must pass the deterministic question-quality
validator: one observable concept, explicit timeframe and subject, neutral
wording, non-clinical language, short text, and matching response scales.

The visualization contract exposes only four fixed chart kinds: time series,
condition comparison, evidence timeline, and self-perception versus observed
behavior. Chart models carry sample counts and preserve missing values as
missing. AI cannot supply arbitrary chart specifications.

## Provenance

Structured values and imported observations retain a source, recorded/imported
time, confirmation state, original reference, transformation version, and
privacy level. Subjective baseline data and observed ActivityWatch data remain
separate during analysis.

The shared source allowlist is `user_entry`, `ai_extraction`, `activitywatch`,
`ipip_baseline`, `manual_import`, and `experiment`. A `prohibited` value is
rejected before persistence.
