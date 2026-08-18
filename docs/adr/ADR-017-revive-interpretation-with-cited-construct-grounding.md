# ADR-017: Revive interpretation generation for the v3 pipeline, grounded by cited (not embedded) behavioral research

## Status

Implemented (interpretation adapter and hypothesis-aware check-ins).

## Context

The currently live self-understanding pipeline (`analyzePcsAnalysisSnapshot`,
reached via `POST /v1/self-understanding/analyze-personal-context`) produces
no natural-language explanation at all -- only structured fields (condition,
outcome, counts). An earlier generation of this product
(`analyzeSelfUnderstandingWithInterpretation`, `apps/api/src/server.ts`, now
entirely commented out) did generate one, via `deterministicInterpretation`
(`packages/self-understanding/src/index.ts`) with an optional local-AI
rephrasing layer on top, following ADR-005's rule: a language model may only
word an already-computed result, never decide it. That capability was left
behind when the product's primary client moved away from the VS Code
extension (now explicitly out of scope, per README) to `demo-web` on the v3
pipeline -- it was not that the explanation feature was rejected, it was
simply not carried over.

Separately, two things in the current design have no cited basis:
`packages/self-understanding/src/constructs.ts`'s `CONSTRUCT_MAPPING_RULES`
assigns each construct a `priority` (60-100) with no stated source, and
`deterministicInterpretation`'s `nextExperiment` hardcodes a 7-day duration
and a 3-observations-per-cohort success condition. Both are plausible but
unverified. Published Experience Sampling Method (ESM) / Ecological
Momentary Assessment (EMA) research studies exactly the relationships this
project's construct catalog encodes (sleep, mood, stress, attention,
workload), and could ground these numbers instead of leaving them as
unexplained constants -- the same category of gap ADR-021 in the sibling
Personal-Context-Studio repository found in its own detector's version
string (`physiological-personal-v1`, no cited source, no measured
precision).

## Decision

**1. Port `deterministicInterpretation` (and its `local_ai` /
`deterministic_fallback` pattern) to the v3 pipeline.** Build an adapter from
`analyzePcsAnalysisSnapshot`'s hypothesis shape to
`SelfUnderstandingInterpretationInputV2`, so `statementJa`,
`nextExperiment`, and `selfModelCandidateJa` are produced for the pipeline
that is actually live today, not the abandoned one. ADR-005's boundary is
unchanged: the deterministic evaluator continues to decide evidence,
direction, and candidate state; AI may only reword the result already
computed, with unconditional fallback to deterministic wording.

**2. Use published ESM/EMA research as cited design-time reference
material only -- not embedded or bundled data.** Specifically:

- StudentLife (Dartmouth, 48 students, 10 weeks), GLOBEM (University of
  Washington, 497 students, 4 years), Tesserae (757 information workers),
  and PMData (16 participants, 5 months) to check whether
  `CONSTRUCT_MAPPING_RULES`'s priority ordering matches relationships these
  studies actually found, and to give the 7-day/3-observation experiment
  defaults a cited basis instead of none.
- JESMA (Japan Experience Sampling Method Association) and its associated
  tooling as a reference for the cultural and linguistic fit of check-in
  question wording, since the cited sensing datasets above are
  English-language, US-population studies and do not transfer to a Japanese
  user directly.

**3. Improve `createCheckin`'s question text.** It currently returns one of
two fixed English strings regardless of which hypothesis triggered the
check-in. Personalize it using the hypothesis's condition/outcome labels,
informed by validated EMA instrument phrasing conventions found in the cited
research rather than invented wording.

**4. Delete the dead v1 pipeline** (`analyzeSelfUnderstanding`,
`analyzeSelfUnderstandingPractical`, and the already-commented
`analyzeSelfUnderstandingWithInterpretation` in `apps/api/src/server.ts`)
once `deterministicInterpretation`'s logic is confirmed reachable from v3 --
not before, so the only working copy of this logic is not removed before its
replacement exists.

## Implementation

- `packages/self-understanding/src/pcsSnapshotAnalysis.ts` adapts live v3
  hypothesis results to `SelfUnderstandingInterpretationInputV2`; the shared
  `deterministicInterpretation` path produces Japanese statements, experiment
  guidance, and self-model candidate text with deterministic fallback.
- `apps/api/src/server.ts` exposes that interpretation through the live
  personal-context analysis response and makes hypothesis check-ins name their
  actual condition and outcome fields. Random check-ins retain their generic
  activity question.
- No research dataset is bundled or transmitted. The cited ESM/EMA studies
  remain design-time references only.

## Alternatives Considered

- **Download and embed the cited datasets (StudentLife/GLOBEM/Tesserae/
  PMData) into MeTheory:** rejected, and now confirmed rather than
  hypothetical. Checked license/access terms:
  - **StudentLife**: no public license posted with the dataset; Dartmouth's
    general policy requires a data use agreement before student data is
    released to a researcher. Gated.
  - **GLOBEM**: hosted on PhysioNet under the "PhysioNet Credentialed Health
    Data License 1.5.0" -- requires a signed Data Use Agreement and
    completed CITI human-subjects-research training before any access.
    Gated, not something this project can adopt as a bundled resource.
  - **Tesserae**: access requires a Data Use Agreement plus a research
    proposal approved by the project lead, on top of participant informed
    consent restrictions. Its own terms explicitly state LLM use on the
    data is disallowed, since participants never consented to that. Gated,
    and this specific restriction matters directly for a project that uses
    a local LLM elsewhere in its pipeline.
  - **PMData**: the only one of the four that is openly licensed --
    Creative Commons Attribution 4.0 (per the current official
    `datasets.simula.no/pmdata/` page), requiring only attribution. Note the
    original 2020 paper describing it stated CC BY-NC 4.0 (non-commercial);
    this discrepancy should be confirmed directly against the live page
    before relying on it for anything beyond citing the paper's findings.

  None of this changes the decision -- MeTheory still has no runtime need
  for aggregate population data, so citing published findings from these
  four studies remains fine regardless of which are gated, but three of the
  four could not be legally adopted as embedded/bundled data even if there
  were a reason to.

  **If any actual LLM-assisted processing of a cited dataset were ever
  wanted** (not currently planned -- MeTheory only needs published
  findings), the four differ sharply: Tesserae's terms explicitly disallow
  LLM use on the data at all, since participants never consented to it.
  GLOBEM's PhysioNet license explicitly permits LLM use, but only with a
  locally-deployed model (a cloud API is allowed solely under a
  zero-data-retention policy, and the data may not be shared with anyone
  outside the credentialed individual) -- notably, this is the same
  local-first, no-third-party-disclosure shape this project's own AI
  boundary (ADR-005) already follows. PMData's CC BY 4.0 (pending the
  CC-BY-NC discrepancy noted above) carries no LLM-specific restriction.
  StudentLife's actual DUA text was not found in this search and remains
  unverified either way.

  **Broader search for openly-licensed alternatives (no DUA at all)**
  turned up several worth noting for future reference, though found late
  and not yet weighed as heavily as the original four:
  - **openESM** -- a published, curated database of openly available
    experience-sampling datasets (Behavior Research Methods journal). Worth
    using as a discovery hub if more studies are needed later, rather than
    searching one-off.
  - **"An open, fully-processed data resource for studying mood and sleep
    variability in the developing brain"** -- explicitly stated as openly
    available with no data use agreement.
  - **Corona Health App Adolescents Study** (Zenodo) -- Creative Commons
    licensed, general adolescent population, real EMA + mobile sensing data
    from a non-clinical-recruitment study.
  - **ScopeSense** (Simula, sibling to PMData) -- 8.5-month sport/nutrition/
    lifestyle lifelogging dataset, likely CC BY like the rest of Simula's
    published datasets.

  A caution on some of the above: several openly-available EMA datasets
  found in this space (e.g. Fisher et al.'s GAD/MDD outpatient EMA data,
  Simula's HYPERAKTIV/Psykose/Depresjon) are drawn from clinically diagnosed
  populations. Citing a finding from a diagnosed clinical sample to justify
  a construct-mapping priority in a product that repeatedly states it is
  non-clinical (this ADR's own construct catalog, ADR-002's analysis
  boundary) needs care -- a relationship found in a GAD/MDD sample does not
  automatically generalize to this product's general, non-diagnosed user
  base, and citing it uncritically would blur a boundary this project has
  otherwise been deliberate about.
- **Fine-tune or prompt a model directly on this research to auto-generate
  explanations:** rejected -- reintroduces the local-model accuracy/hosting
  trade-off this project already resolved in ADR-005's favor of a
  deterministic evaluator with optional, non-authoritative AI wording.
- **Leave `CONSTRUCT_MAPPING_RULES`'s priorities and the experiment
  defaults as un-cited constants:** rejected as unnecessary now that the
  relevant research has been identified; not citing it once known would be
  the same kind of ungrounded-constant gap ADR-021 (Personal-Context-Studio)
  flagged in a different subsystem.

## Consequences

- Nothing here is implemented. Decided: port the interpretation layer to
  v3; use the named studies and JESMA as cited reference material, not
  embedded data; personalize check-in question text; delete the dead v1
  functions only after the port lands.
- License/access terms for all four sensing datasets have now been checked
  (see Alternatives Considered): StudentLife, GLOBEM, and Tesserae are
  gated behind data use agreements and cannot be adopted as bundled data;
  PMData is CC BY 4.0 per its current listing (pending confirmation against
  the CC BY-NC 4.0 stated in its original paper). This ADR authorizes
  referencing all four studies' published findings, not adopting any
  dataset itself, and that distinction must hold in the implementation
  regardless of which license applies.
- `CONSTRUCT_MAPPING_RULES`'s priority values and the 7-day/3-observation
  experiment defaults may change once actually checked against the cited
  literature; until then they remain as they are today.
- The v3-to-`SelfUnderstandingInterpretationInputV2` adapter is new work,
  not a trivial rewire -- the two shapes were never designed against each
  other.

## Reversal

If cross-checking against the cited research does not change any priority
or default value (the existing numbers turn out to already be reasonable),
keep the values but keep the citations as documentation of why. If the
adapter between v3's shape and `SelfUnderstandingInterpretationInputV2`
turns out to require changing v3's own output contract, stop and treat that
as a separate ADR rather than folding a breaking change into this one.
