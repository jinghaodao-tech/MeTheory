# MeTheory Parameter EAV

MeTheory stores observations as an entity-attribute-value model. A new parameter is a row in `parameter_definitions`, not a new SQLite column. This keeps the dictionary extensible while preserving typed storage columns and domain validation.

## Responsibilities

- `parameter_definitions` describes meaning, type, layer, temporal use, and evaluation roles.
- `parameter_allowed_values` stores choices for choice parameters.
- `parameter_source_definitions` records user, system, device, external, derived, and AI-inferred sources.
- `parameter_question_metadata` stores measurement semantics used to generate a question at runtime.
- `parameter_ai_access_policies` and `user_parameter_settings` independently control collection, sync, and external-AI access.
- `observation_episodes` groups one check-in, activity, follow-up, or import.
- `parameter_values` stores one typed value per episode and distinguishes missing from `false`.
- `hypothesis_parameter_requirements` links a hypothesis to required scope, cohort, outcome, explanation, and quality parameters.
- `generated_questions` records the generated wording, answer schema, reason, and validation result.

Parameters have three layers: `base`, `hypothesis_dependent`, and `sensitive`. Sensitive policies start at `none`; collection, cloud sync, and AI access are separate settings.

When a hypothesis is saved, its existing spec fields are mapped to parameter requirements. Missing user-askable requirements can be converted into deterministic fallback questions. No question catalog or external AI call is required.

## Candidate discovery

`generateHypothesisCandidatesForUser` reads recent EAV values and pairs active
condition parameters with active outcome parameters. Boolean and choice values
become cohorts; numeric and ordinal values use low/high range rules. Candidates
are rejected until both cohorts have enough samples, the missing rate is
acceptable, the sample balance is adequate, and the normalized effect passes
the configured threshold. The deterministic score stores effect, sample size,
balance, stability, missing, and quality components in
`hypothesis_candidates`.

Candidates can be listed, dismissed, or adopted. Adoption creates a tracking
hypothesis and its cohort/outcome requirements. Question target selection then
checks shortages, system-available sources, and cooldown; at most three targets
are returned and deterministic fallback questions are stored with their reason
and answer schema.

Existing `responses` and `observations` remain compatible. New check-in responses additionally create an `observation_episode` and typed `parameter_values` in the same transaction. Migration `legacy_observations_v1` converts old observations using deterministic IDs and records completion in `parameter_migration_runs`, so it is safe to rerun.

## Adding a parameter

Add a seed definition with its type, range or allowed values, layer, source, question metadata, and AI policy. No table migration is needed for the new parameter. External integrations should implement a source adapter that writes through the repository with a provider key and external record ID.

## Commands

```text
npm run typecheck:mobile
npm run test:mobile
npm run verify
```

The current scope intentionally excludes OpenAI communication, cloud sync, authentication, external calendar or health integrations, and diagnostic use.
