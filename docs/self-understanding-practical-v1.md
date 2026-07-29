# Self Understanding Practical v1

## Purpose

Self Understanding turns confirmed, shareable Personal Context Studio values into small,
testable, non-clinical observations. It is not a medical, psychological, or
personality diagnosis feature.

## Analysis boundary

- Only reviewed, shareable values in a `pcs-analysis-snapshot-v1` are analysed.
- The deterministic evaluator decides cohorts, counts, missingness, effect,
  stability, supporting Entries, contradicting Entries, and candidate status.
- The default gate requires eight PCS records and three valid values in each group.
- A candidate can be an emerging tendency, a relatively stable candidate, or
  unstable. Insufficient data produces a shortage explanation instead of a
  hypothesis.
- No disease, disorder, diagnosis, probability, treatment, medication, or
  care recommendation is represented or stored.
- PCS template fields may have an allowlisted `semanticRole`. Roles map to the
  non-clinical construct catalog, and ambiguous or sensitive suggestions need
  confirmation. See [the catalog](self-understanding-construct-catalog.md).
- A stored role is analysis-ready only after confirmation. Legacy inference may
  be used only for a high-confidence, normal field; otherwise the field is
  returned in `excludedFields` with a reason and is excluded from analysis.
- Candidate history assigns `emerging`, `state_dependent`,
  `relatively_stable`, or `uncertain` scope. This is evidence scope, not a
  personality label.

## Explanation and AI

The standard Japanese explanation is deterministic and works when every AI
provider is disabled. It reports the observed conditions, counts, aggregate
values, uncertainty, counterexamples, and a 7-day recording experiment.

No note body, arbitrary SQL result, or database export is automatically sent to
an AI provider. An optional local-only explanation provider receives only the
versioned, validated `SelfUnderstandingInterpretationInputV2` DTO. It cannot
change the construct, evidence direction, candidate state, or Entry references.
Invalid output falls back to deterministic wording.

The analysis API returns a stable view DTO containing construct, tendency scope,
status, statistics, supporting and contradicting Entry references, alternative
explanations, the next experiment, and technical provenance. A legacy-shaped
`legacyHypotheses` field remains available during client migration.

## Workflow

1. Open **Self Understanding** in the VS Code MeTheory view.
2. Choose one, two, or four weeks; optionally select a template and fields.
3. Request and analyse the selected period's confirmed PCS values.
4. Inspect the deterministic explanation and open supporting or contradicting
   PCS record references from the candidate card.
5. Rate the candidate as fits, does not fit, or on hold.
6. For a fitting candidate, edit the proposed Self Model sentence if needed.
7. Explicitly accept it to add an active Self Model belief. Rejection never
   adds a belief.

## Persistence

`self_understanding_analysis_history` retains canonical candidate snapshots for
deduplication and scope, including template/version/field identities, scale
fingerprints, and a sorted PCS-record-set fingerprint. Stable scope requires three
independent periods, at least 24 unique paired records, and at most 35% record
overlap; history without record identities cannot satisfy that gate.
`hypothesis_reviews` records the rating and source period. `self_model_candidates`
and `self_beliefs` retain construct, scope, periods, and field pairs. The user
chooses create-new, propose-update, or keep-separate; no Self Model is replaced
automatically.

## Current limitations

Candidate generation is deterministic and comparison-based. It does not infer
causality, diagnose health conditions, or learn opaque personal weights. The
first version uses the built-in standard explanation rather than automatically
calling a local or external model.
