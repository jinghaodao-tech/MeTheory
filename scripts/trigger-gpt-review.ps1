[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BridgeUrl,
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$PrNumber,
    [Parameter(Mandatory)][string]$CustomGptUrl,
    [ValidateSet("pr", "repository")][string]$ReviewScope = "pr",
    [switch]$ForceReview,
    [ValidateRange(5, 3600)][int]$DebounceSeconds = 90,
    [ValidateRange(60, 86400)][int]$RetryCooldownSeconds = 1800,
    [ValidateRange(30, 3600)][int]$ResultTimeoutSeconds = 600
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    throw "REVIEW_BRIDGE_TOKEN is not configured in this PowerShell session."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $ghCandidates = @(
        "C:\Program Files\GitHub CLI\gh.exe",
        "C:\Program Files (x86)\GitHub CLI\gh.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI\gh.exe")
    )
    $gh = $ghCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $gh) { throw "GitHub CLI (gh) is required." }
} else {
    $gh = (Get-Command gh).Source
}

$gitCandidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
)
$git = if (Get-Command git -ErrorAction SilentlyContinue) { (Get-Command git).Source } else { $gitCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $git) { throw "Git is required." }
$repoRoot = $null
$probe = (Get-Location).Path
while ($probe) {
    if (Test-Path -LiteralPath (Join-Path $probe ".git")) {
        $repoRoot = $probe
        break
    }
    $parent = Split-Path -Parent $probe
    if (-not $parent -or $parent -eq $probe) { break }
    $probe = $parent
}
if (-not $repoRoot) { throw "Run this script inside the MeTheory Git repository." }
Set-Location $repoRoot

$cli = Join-Path $repoRoot "review-trigger\src\cli.js"
if (-not (Test-Path -LiteralPath $cli)) {
    throw "ChatGPT review trigger is missing: $cli"
}
$playwright = Join-Path $repoRoot "review-trigger\node_modules\playwright-core"
if (-not (Test-Path -LiteralPath $playwright)) {
    throw "Review trigger dependencies are missing. Run .\scripts\setup-chatgpt-review-trigger.ps1 first."
}

$arguments = @(
    $cli,
    "trigger",
    "--bridge-url", $BridgeUrl,
    "--repository", $Repository,
    "--pr-number", $PrNumber,
    "--custom-gpt-url", $CustomGptUrl,
    "--review-scope", $ReviewScope,
    "--debounce-seconds", $DebounceSeconds,
    "--retry-cooldown-seconds", $RetryCooldownSeconds,
    "--result-timeout-seconds", $ResultTimeoutSeconds
)
if ($ForceReview) { $arguments += "--force" }
if ($ForceReview) { Write-Output "Force review requested." }

& node @arguments
if ($LASTEXITCODE -ne 0) {
    throw "ChatGPT review trigger failed with exit code $LASTEXITCODE."
}
