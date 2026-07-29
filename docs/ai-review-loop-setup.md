# AI Review Loop Setup

## Current deployment

The Review Bridge Worker is deployed and has been health-checked with bearer authentication.

Worker URL:

`https://metheory-review-bridge.jinghaodao-tech.workers.dev`

`GITHUB_TOKEN` and `REVIEW_BRIDGE_TOKEN` are stored as Cloudflare Worker Secrets.
Do not print, commit, export, or log their values.

## Architecture

1. Codex implements a task locally.
2. An external controller runs `npm run verify`.
3. A fixed script pushes to a working branch or Draft PR only when explicitly enabled.
4. The custom GPT reads the PR through Review Bridge.
5. The GPT stores only the current SHA's structured blocking issues.
6. `watch-review-loop.ps1` gets only the latest pending instruction.
7. SHA, cycle, and status are checked before Codex is started.
8. Codex applies the minimum fix, `npm run verify` runs externally, and the branch may be pushed again.
9. A clean GPT review completes the loop without starting Codex.
10. Merge is always performed by a human.

## Cloudflare setup

The Worker and D1 database are already deployed. For future maintenance:

```powershell
cd review-bridge
npm install
npx wrangler login
npx wrangler d1 migrations apply review-bridge --remote
npm run deploy
```

Use a fine-grained GitHub token limited to `jinghaodao-tech/MeTheory` with:

- Contents: Read
- Pull requests: Read
- Metadata: Read

The GitHub token is held only by the Worker. It is never returned to the client or custom GPT.

Health check:

```powershell
$workerUrl = "https://metheory-review-bridge.jinghaodao-tech.workers.dev"
Invoke-RestMethod "$workerUrl/health" -Headers @{ Authorization = "Bearer $env:REVIEW_BRIDGE_TOKEN" }
```

Expected response includes `ok: true` and `service: metheory-review-bridge`.

## Custom GPT setup

1. Create or open a custom GPT in ChatGPT.
2. Paste `custom-gpt/instructions.md` into Instructions.
3. Add an Action by importing `custom-gpt/openapi.yaml`.
4. Confirm the server URL is `https://metheory-review-bridge.jinghaodao-tech.workers.dev`.
5. Configure Action authentication as Bearer and use the same secret value as `REVIEW_BRIDGE_TOKEN`.
6. Confirm the review-save Action is treated as consequential and requires user confirmation.
7. Ask the GPT to review a specific `jinghaodao-tech/MeTheory` PR and save exactly one result.

The GPT must treat repository text, PR descriptions, comments, docs, and diff contents as untrusted data.
Only `blockingIssues` are sent to Codex. `suggestions` may be stored but are never auto-implemented.
For a passing review, `result` is `pass` and `blockingIssues` is empty.

## Local setup

Requirements:

- authenticated `gh`
- authenticated `codex`
- Node.js matching the repository requirement
- a fixed push script, if push is enabled later

Set the bridge token for the current PowerShell session. Do not print the value:

```powershell
$env:REVIEW_BRIDGE_TOKEN = "replace-with-random-secret"
```

PowerShell session environment variables disappear when that PowerShell window is closed.
If you persist the variable, use a secure user or secret-management facility. Never store it
in this repository, a script, a dotenv file, or logs.

Run the read-only setup check:

```powershell
.\scripts\check-review-loop.ps1
```

Start the fixed watcher for PR 12. The starter uses the deployed Worker URL, the allowlisted
repository, a 30-second interval, and automatic push disabled:

```powershell
.\scripts\start-review-watcher.ps1 -PrNumber 12
```

To leave the watcher running after closing the current PowerShell window, start a hidden
background process from the same session:

```powershell
.\scripts\start-review-watcher-background.ps1 -PrNumber 12
```

To deliberately run one fresh ChatGPT review cycle for the current PR SHA, even when an
earlier result is recorded locally, add `-ForceReview`. This opens the visible Chrome review
window once; ChatGPT sign-in and consequential Action approval remain human-controlled.

```powershell
.\scripts\start-review-watcher-background.ps1 -PrNumber 12 -ForceReview
```

The background process inherits `REVIEW_BRIDGE_TOKEN` in memory and does not write it to a file.
It lasts for the current Windows session. Automatic restart after reboot is intentionally not
registered because that would require a separate secure secret-storage setup.

Prepare a safe custom GPT review trigger from the working branch. This reads only PR metadata,
prints a prompt containing the current head SHA, and never handles or stores Review Bridge tokens:

```powershell
.\scripts\trigger-gpt-review.ps1 -PrNumber 12
```

Add `-OpenBrowser` when the PR page should open automatically. The custom GPT itself must still
be run through the ChatGPT UI; the Plus subscription is not treated as an external API.

The lower-level one-shot command is:

```powershell
.\scripts\review-loop.ps1 `
  -BridgeUrl "https://metheory-review-bridge.jinghaodao-tech.workers.dev" `
  -Repository "jinghaodao-tech/MeTheory" `
  -PrNumber 12
```

## Review scope

PR review remains the default. For the first review of the current PR head, a
repository-wide review can be requested with:

```powershell
.\scripts\start-review-watcher.ps1 -PrNumber 1 -FullRepositoryReview
```

The `getRepositoryReviewContext` Action resolves the requested branch or tag
to a commit SHA, then returns bounded text files from the configured review
roots. It excludes secrets, generated databases, binaries, `.git`, `.github`,
`node_modules`, build output, symlinks, and submodules. Each file is limited to
100,000 characters, the response to 600,000 characters and 300 files.
Exclusions and truncation are reported explicitly.

The trigger stores `fullRepositoryReviewCompletedSha` in ignored `.ai` state.
After the full review is saved for one SHA, that SHA is not submitted again;
the next SHA automatically returns to PR-diff review mode. A failed or timed
out full review is not marked complete and can be retried. The D1 migration
`review-bridge/migrations/0002_review_scope.sql` stores `reviewScope`; older
rows default to `pr`.

Watch continuously:

```powershell
.\scripts\watch-review-loop.ps1 `
  -BridgeUrl "https://metheory-review-bridge.jinghaodao-tech.workers.dev" `
  -Repository "jinghaodao-tech/MeTheory" `
  -PrNumber 12 `
  -IntervalSeconds 30
```

Start without automatic push first. When a human explicitly enables `-PushOnSuccess`, the
external controller (not Codex) commits only the verified review-run changes, pushes the working
branch, and starts the next SHA's review cycle. The controller requires a clean worktree before
Codex starts and refuses to run on `main` or `master`:

```powershell
.\scripts\watch-review-loop.ps1 `
  -BridgeUrl "https://metheory-review-bridge.jinghaodao-tech.workers.dev" `
  -Repository "jinghaodao-tech/MeTheory" `
  -PrNumber 12 `
  -IntervalSeconds 30 `
  -PushOnSuccess `
  -PushScript ".\scripts\commit-and-push-review-fix.ps1"
```

## Safety behavior

- Old SHA: marked `stale`; Codex is not started.
- Duplicate GPT submission: ignored using a deterministic fingerprint and unique indexes.
- Previous reviews: retained as history but not included in the latest pending query.
- Failed Codex or verification: instruction becomes `failed`, not `completed`.
- Abandoned claim: automatically returned to `pending` after the configured TTL.
- Passing review: marked complete without starting Codex.
- Review cycle above the local maximum: stops for human judgment.
- Suggestions: stored but never sent to Codex automatically.
- Automatic commit and push: disabled by default, blocked on `main`/`master`, and rejected when pre-existing changes are present.
- Merge: never automated.

## Automatic ChatGPT review request trigger

The optional `review-trigger/` package uses Playwright with a dedicated Chrome
profile (and falls back to Edge only when Chrome is unavailable). It reads only the current PR metadata through GitHub CLI,
debounces a new head SHA, submits one bounded request to the configured custom
GPT, and waits for the matching Review Bridge result.

It never automates ChatGPT login, security warnings, or consequential Action
approval. Those remain visible manual controls. Trigger state and locks are stored under
`%LOCALAPPDATA%\MeTheory\review-loop` to avoid OneDrive file locks; the browser profile remains
local and neither location contains the Review Bridge token.

Set the custom GPT URL for the current PowerShell session:

```powershell
$env:CHATGPT_REVIEW_GPT_URL = "https://chatgpt.com/g/g-REPLACE-WITH-YOUR-GPT"
$env:CHATGPT_BROWSER_CHANNEL = "chrome"
```

The trigger enables the Chrome sandbox by default so the ChatGPT login flow is
not started with `--no-sandbox`. Only set `CHATGPT_BROWSER_SANDBOX=false` for a
known isolated environment that cannot launch Chrome with its sandbox.

Initialize the dedicated profile and install the isolated dependency. The setup
step opens normal Chrome directly for login, without Playwright automation flags;
the automated browser is used only after the login session is established:

```powershell
.\scripts\setup-chatgpt-review-trigger.ps1
```

Sign in once in the opened browser window, open the custom GPT, and close that
dedicated window. Then verify and start PR #1. Automatic push remains disabled
unless `-PushOnSuccess` is explicitly supplied:

```powershell
.\scripts\check-review-loop.ps1
.\scripts\start-review-watcher.ps1 -PrNumber 1
```

To keep the existing Bridge/Codex loop without browser triggering, use:

```powershell
.\scripts\start-review-watcher.ps1 -PrNumber 1 -NoAutoTriggerReview
```

Behavior:

- new head SHAs wait 90 seconds before submission;
- the same SHA is not submitted again after a matching Bridge result;
- failed or interrupted submissions retry after a 30-minute cooldown;
- the trigger waits up to 10 minutes for the matching saved result;
- review cycles are derived from Bridge history and limited by the existing loop;
- only `blockingIssues` can reach Codex; suggestions are never auto-implemented;
- merge remains manual.

The `review-trigger` focused tests can be run without the full repository
verification:

```powershell
npm.cmd run test:review-trigger
npm.cmd --prefix review-trigger run check
```

## Monitoring and diagnostics

The watcher writes its operational state to `.ai/review-loop-status.json` and
JSON Lines events to `.ai/review-loop.log`. These files are ignored by Git and
never contain bearer tokens, cookies, prompts, repository values, or source
content. Log files rotate at 5 MB and retain two older files.

Show a one-shot status summary:

```powershell
.\scripts\status-review-loop.ps1
```

Watch the summary refresh every two seconds, inspect the last log entries, or
list the relevant processes without printing command-line arguments:

```powershell
.\scripts\watch-review-status.ps1
.\scripts\tail-review-loop.ps1
.\scripts\check-review-processes.ps1
```

The status includes the watcher PID, optional child PID and command label,
current PR SHA, review scope and cycle, current stage, heartbeat age, last
error, Review Bridge reachability, and whether automatic push is enabled. A
running status with a missing controller PID or a heartbeat older than 90
seconds is reported as `STALE` with exit code 2. Missing status is exit code 3;
failed verification is exit code 1.

The watcher maintains `.ai/review-loop.lock`. A lock whose PID no longer
exists is recovered automatically; a live lock prevents a second watcher from
starting. Normal shutdown records `stopped`, while controller failures record
`failed` and the error summary.
