[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$PrNumber
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$bridgeUrl = "https://metheory-review-bridge.jinghaodao-tech.workers.dev"
$repository = "jinghaodao-tech/MeTheory"
$intervalSeconds = 30

if ([string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    throw "REVIEW_BRIDGE_TOKEN is not configured in this PowerShell session."
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

$watcher = Join-Path $PSScriptRoot "watch-review-loop.ps1"
if (-not (Test-Path -LiteralPath $watcher)) {
    throw "Watcher script not found: $watcher"
}

Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "Starting the MeTheory review watcher for PR #$PrNumber. Automatic push is disabled."
& $watcher `
    -BridgeUrl $bridgeUrl `
    -Repository $repository `
    -PrNumber $PrNumber `
    -IntervalSeconds $intervalSeconds
