# ADR-015: Separate inference confidence naming from DB column naming

## Context

`inferSemanticRole` (`packages/self-understanding/src/semanticRoles.ts`)
assigns a semantic role to a template field using a fixed regex allowlist,
and previously labeled the result `confidence: 0.9 | 0.4`. This is not a
statistical or model-derived probability; it is a two-valued heuristic
weight (0.9 if a pattern matched, 0.4 if it fell through to the "other"
default). A field literally named `confidence` holding one of exactly two
possible values reads to anyone consuming it — a future reviewer, a future
UI, a future AI wording layer — as a calibrated certainty estimate ("90%
sure"), which it is not and was never intended to be.

Separately, two SQLite/Postgres columns already exist with `confidence` in
their name: `entry_field_values.confidence` and
`entry_template_fields.semantic_role_confidence`
(`apps/api/src/db/migrate.ts`, `db/ts_mvp_schema.sql`,
`db/postgresql_schema.sql`). These are part of the record/template API
surface that `apps/api/src/server.ts` now marks as retired ("Templates,
entries, record privacy, and Markdown search belong to PCS") — no live route
in this repository currently reads or writes them. Renaming a column that
already exists in shipped schema is a migration, with compatibility and
rollback cost, for a surface that is not currently wired to anything live.

## Decision

Split the naming problem into two parts and resolve only the live one now:

1. **DB columns are unchanged.** `entry_field_values.confidence` and
   `entry_template_fields.semantic_role_confidence` keep their current
   names. If and when the retired record API surface is revived, a real
   migration (new columns, dual-read period, then drop) should accompany
   that work — this ADR does not authorize that migration and does not
   need to, since nothing live depends on these columns today.
2. **`SemanticRoleSuggestion.confidence` is renamed to
   `inferenceConfidence`, and a new `inferenceMethod: "pattern_match" |
   "fallback" | "none"` field is added.** This is the one place the
   ambiguous name was live: `inferSemanticRole`,
   `validateSemanticRoleSuggestion`, and `semanticRoleNeedsConfirmation`
   all read and construct this type, and grep confirms no other producer
   of a `SemanticRoleSuggestion` exists in this repository — the type is,
   in practice, entirely about rule-based inference, so naming it that way
   is not an overreach. A branded `SemanticRoleConfidence` type
   (`semanticRoleConfidence(value)`, throwing outside `[0, 1]`) replaces
   the bare `number` to make the 0–1 constraint a construction-time
   invariant rather than a validation-function-only check.

The existing `0.85` confirmation threshold, the `0.9`/`0.4` heuristic
values, and the requirement that a stored/confirmed role always wins over
an inferred one (`resolveSemanticRole` already short-circuits on
`input.confirmed`/`storedSource`) are unchanged — this ADR is a naming and
typing change, not a policy change.

## Consequences

- `inferSemanticRole(...).confidence` no longer exists; callers must use
  `.inferenceConfidence` and, where relevant, branch on `.inferenceMethod`
  rather than inferring "was this a pattern match?" from the raw number.
- Any future UI or AI-wording layer that surfaces this value must present
  `inferenceMethod` (e.g. "matched by a naming rule" / "no rule matched")
  rather than the raw number as a percentage — the field's own doc comment
  says this explicitly, so the constraint travels with the type.
- The two DB columns remain named `confidence` / `semantic_role_confidence`
  and continue to be ambiguous in isolation, but they are inert: no code
  path in this repository reads or writes them today. `docs/spec/v1-scope.md`
  and the "Retired record API" comment in `server.ts` are the source of
  truth for that status, not this ADR.

## Reversal

If the retired record API surface is revived and these DB columns become
live again, re-open this decision alongside a real migration plan (additive
columns, dual-read, deprecation window) rather than renaming the columns
directly — see the "Excluded"/"Planned" framing in
`docs/spec/v1-scope.md` for how this repository treats that kind of change.
