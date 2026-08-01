# Mobile Archive Decision

Expo is removed from the active MeTheory workspace because the current environment cannot build or validate the mobile app reliably. This is an explicit product-surface decision, not a claim that the mobile client is production-ready.

The active verification surface is the Node API, CLI, PCS integration, analysis engine, experiments, and synthetic scenarios. The `apps/mobile` source is retained but excluded from the root `package.json`, lockfile dependency graph, and GitHub Actions.
