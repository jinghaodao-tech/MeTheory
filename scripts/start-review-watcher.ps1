[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$PrNumber,
    [switch]$NoAutoTriggerReview,
    [switch]$FullRepositoryReview,
    [switch]$ForceReview,
    [string]$CustomGptUrl = $env:CHATGPT_REVIEW_GPT_URL,
    [switch]$PushOnSuccess,
    [string]$PushScript = ".\scripts\commit-and-push-review-fix.ps1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$bridgeUrl = "https://metheory-review-bridge.jinghaodao-tech.workers.dev"
$repository = "jinghaodao-tech/MeTheory"
$intervalSeconds = 30
$autoTriggerReview = -not $NoAutoTriggerReview

if ([string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    throw "REVIEW_BRIDGE_TOKEN is not configured in this PowerShell session."
}
if ($autoTriggerReview -and [string]::IsNullOrWhiteSpace($CustomGptUrl)) {
    throw "Set CHATGPT_REVIEW_GPT_URL to the custom GPT /g/ URL, or use -NoAutoTriggerReview."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $ghCandidates = @(
        "C:\Program Files\GitHub CLI\gh.exe",
        "C:\Program Files (x86)\GitHub CLI\gh.exe",
        (Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI\gh.exe")
    )
    if (-not ($ghCandidates | Where-Object { Test-Path -LiteralPath $_ })) {
        throw "GitHub CLI (gh) is required. Install it and run gh auth login."
    }
}
$codexCandidates = @(
    (Join-Path $env:APPDATA "npm\codex.cmd"),
    (Join-Path $env:APPDATA "npm\codex.ps1"),
    (Join-Path $env:APPDATA "npm\codex.exe")
)
if (-not (Get-Command codex -ErrorAction SilentlyContinue) -and
    -not ($codexCandidates | Where-Object { Test-Path -LiteralPath $_ })) {
    throw "codex is required and must be available on PATH."
}
if ($autoTriggerReview -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required for automatic ChatGPT review requests."
}
$gitCandidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
)
if (-not (Get-Command git -ErrorAction SilentlyContinue) -and -not ($gitCandidates | Where-Object { Test-Path -LiteralPath $_ })) {
    throw "Git is required. Add Git to PATH or install it in a standard location."
}

$watcher = Join-Path $PSScriptRoot "watch-review-loop.ps1"
if (-not (Test-Path -LiteralPath $watcher)) {
    throw "Watcher script not found: $watcher"
}

Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "Starting the MeTheory review watcher for PR #$PrNumber. Automatic push is disabled."
$arguments = @{
    BridgeUrl = $bridgeUrl
    Repository = $repository
    PrNumber = $PrNumber
    IntervalSeconds = $intervalSeconds
}
if ($autoTriggerReview) {
    $arguments.AutoTriggerReview = $true
    $arguments.CustomGptUrl = $CustomGptUrl
}
if ($FullRepositoryReview) { $arguments.FullRepositoryReview = $true }
if ($ForceReview) { $arguments.ForceReview = $true }
if ($PushOnSuccess) {
    $arguments.PushOnSuccess = $true
    $arguments.PushScript = $PushScript
}
& $watcher @arguments
