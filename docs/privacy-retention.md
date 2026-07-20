# Privacy and Retention Baseline

MeTheory handles sensitive-adjacent behavioral data such as mood, energy,
stress, activity choices, and time-of-day patterns. Privacy is a product
boundary, not a later infrastructure task.

## Data handling rules

- Collect only fields required by the active hypothesis or baseline flow.
- Keep raw free text separate from normalized observations and derived evidence.
- Redact names, email addresses, URLs, precise locations, and contact details before external AI calls.
- Store AI provider, model, schema version, input hash, and output confidence for every extraction.
- Never use an individual self-model as an input to cross-user ranking or marketing.
- Use differential privacy only for opt-in aggregate research or product analytics.

## Default retention tiers

| Tier | Raw free text | Structured observations | Use |
| --- | --- | --- | --- |
| Short | 30 days | 180 days | Default for users who do not opt into extended research |
| Standard | 90 days | 24 months | Product default when longer history is needed |
| Research opt-in | Explicitly configured | Explicitly configured | Separate consent and purpose |

Retention values are product policy defaults, not legal advice. Each user-facing
screen must expose the applicable purpose, retention period, export path, and
deletion path.

## Required workflows

1. Record consent version, locale, screen, grant time, and revocation time.
2. Export user records in a machine-readable format.
3. Erase records from PostgreSQL, object storage, analytics exports, and observability sinks where applicable.
4. Disable push tokens after invalid delivery receipts.
5. Run retention deletion as an idempotent, auditable job.

## AI safety boundary

The AI layer may structure text, propose testable hypotheses, or render a
constrained explanation. It must not diagnose, assert a fixed personality, or
replace deterministic evidence aggregation. Unsupported or insufficient results
must fall back to a neutral explanation and a request for more data.
