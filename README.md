# MeTheory

MeTheory is a local-first self-observation app. It turns self-beliefs into
testable hypotheses, collects lightweight observations, evaluates evidence
deterministically, and presents provisional self-model updates.

The product boundary is explicit: the user chooses the scope of collection,
the system chooses when and what to collect, and AI may only propose bounded
interpretations or candidates. AI never decides facts, evidence strength,
notification timing, hypothesis status, or Self Model updates.

## Contents

- `docs/design-spec.md`: core loop and safety position.
- `docs/domain-language.md`: canonical entities and hypothesis lifecycle.
- `docs/hypothesis-evaluation.md`: versioned comparison evaluation and audit model.
- `docs/collection-responsibility.md`: collection ownership and three-layer presentation model.
- `docs/architecture-research.md`: target architecture and migration plan.
- `docs/technical-architecture.md`: module boundaries and runtime flow.
- `docs/privacy-retention.md`: retention, consent, erasure, and AI safety baseline.
- `docs/implementation-roadmap.md`: phased implementation and beta criteria.
- `docs/notification-policy.md`: notification constraints and user controls.
- `prompts/ai-templates.json`: versioned AI templates.
- `schemas/domain-schema.json`: domain data contract.
- `db/mvp_schema.sql`: Python reference SQLite schema.
- `db/ts_mvp_schema.sql`: TypeScript runtime SQLite schema with Observation and Evidence.
- `packages/domain/src/index.ts`: TypeScript pure rules for evidence, transitions, notification policy, and AI candidate validation.
- `packages/domain/src/hypothesis/`: typed HypothesisSpec, episode construction, conditions, and deterministic evaluators.
- `packages/contracts/src/index.ts`: shared TypeScript request contracts.
- `apps/api/src/server.ts`: TypeScript Node MVP API.
- `backend/core.py`: Python reference implementation kept during migration.

## Commands

Validate the JSON specification:

```powershell
python tools\validate_spec.py
```

Migrate the JSON specification catalog to `data/metheory-spec.sqlite3`:

```powershell
python tools\migrate_json_to_sqlite.py
```

The migration copies the old `data/preference_mirror.sqlite3` catalog to the
new name once, when the new catalog does not exist. The runtime application DB
is separate and uses `data/metheory.sqlite3`.

Run the TypeScript domain tests:

```powershell
npm.cmd test
```

Start the TypeScript MVP API:

```powershell
npm.cmd run dev:api
```

The API listens on `http://127.0.0.1:8100`.

Run the Python compatibility tests:

```powershell
python -m unittest tools.test_mvp -v
```

## Smartphone MVP

The MeTheory smartphone app lives at `apps/mobile`. It keeps Self Beliefs,
Hypotheses, Check-ins, Observations, evaluation history, and notification
settings in the device's `metheory.sqlite` database. Onboarding creates a
separate Self Belief and a `time_of_day_productivity` HypothesisSpec for
day-versus-night observations.

```powershell
npm install
npm run dev:mobile
npm run typecheck
npm run test:mobile
npm run verify
```

Expo Go can exercise onboarding, local SQLite, check-ins, deterministic
evaluation, Evidence, and Self Model. Notification permission and scheduled
delivery require a physical device; notification behavior can require an Expo
development build depending on the SDK and platform. API authentication,
cloud sync, AI, and store distribution are outside this MVP.
