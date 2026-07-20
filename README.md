# Preference Mirror Deep Research Spec

This folder contains a versioned, implementation-oriented specification package for Preference Mirror.

Preference Mirror treats self-beliefs as hypotheses to test through lightweight EMA/ESM-style check-ins. AI is limited to structured transformation, hypothesis candidate generation, next-question suggestions, and safe explanation rendering. The product remains responsible for scheduling, validation, safety boundaries, persistence, and final decisions.

## Contents

- `docs/design-spec.md`: human-readable product and research design summary.
- `prompts/ai-templates.json`: versioned AI prompt templates with input and output schemas.
- `schemas/domain-schema.json`: minimal domain data schema for the MVP.
- `docs/notification-policy.md`: notification scheduling and UX constraints.
- `docs/mvp-metrics.md`: MVP scope and success indicators.
- `tools/validate_spec.py`: local validator for JSON syntax and required template/schema structure.

## Validate

Run:

```powershell
python tools\validate_spec.py
```

