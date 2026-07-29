[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "review-loop-status-lib.ps1")

$status = Get-ReviewLoopStatus
if ($null -eq $status) {
    Write-Host "Review loop status is missing or unreadable."
    exit 3
}

$heartbeatAge = [double]::PositiveInfinity
if ($status.lastHeartbeatAt) {
    $heartbeatAge = ((Get-Date).ToUniversalTime() - [DateTime]::Parse($status.lastHeartbeatAt).ToUniversalTime()).TotalSeconds
}
$controllerAlive = Test-ReviewLoopProcessAlive $status.controllerPid
$heartbeatStale = $status.running -and $heartbeatAge -gt 90
$stale = $status.running -and (-not $controllerAlive -or $heartbeatStale)
$bridgeState = "UNKNOWN"
if (-not [string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$($status.bridgeUrl)/health" -Headers @{ Authorization = "Bearer $env:REVIEW_BRIDGE_TOKEN" } -TimeoutSec 10
        if ($response.StatusCode -eq 200) { $bridgeState = "OK" } else { $bridgeState = "HTTP $($response.StatusCode)" }
    } catch { $bridgeState = "UNREACHABLE" }
} else { $bridgeState = "TOKEN NOT CONFIGURED" }

$stageElapsed = "unknown"
if ($status.stageStartedAt) {
    $stageElapsed = "{0:0}s" -f ((Get-Date).ToUniversalTime() - [DateTime]::Parse($status.stageStartedAt).ToUniversalTime()).TotalSeconds
}
$heartbeatText = if ([double]::IsPositiveInfinity($heartbeatAge)) { "unknown" } else { "{0:0}s ago" -f $heartbeatAge }
$displayState = if ($stale) { "STALE" } elseif ($status.running) { "RUNNING" } else { ([string]$status.stage).ToUpperInvariant() }

Write-Host "Review loop: $displayState"
Write-Host "Controller PID: $($status.controllerPid)$(if ($controllerAlive) { ' (alive)' } else { ' (not found)' })"
Write-Host "PR: $($status.repository) #$($status.prNumber)"
Write-Host "Branch: $($status.branch)"
Write-Host "Head SHA: $($status.headSha)"
Write-Host "Scope: $($status.reviewScope)"
Write-Host "Cycle: $($status.reviewCycle)"
Write-Host "Stage: $($status.stage)"
Write-Host "Stage elapsed: $stageElapsed"
Write-Host "Last heartbeat: $heartbeatText"
if ($status.childPid) {
    $childAlive = Test-ReviewLoopProcessAlive $status.childPid
    Write-Host "Child process: $($status.childPid)$(if ($childAlive) { ' (alive)' } else { ' (not found)' }) [$($status.childCommand)]"
} else { Write-Host "Child process: none" }
Write-Host "Next action: $($status.nextAction)"
Write-Host "Automatic push: $(if ($status.automaticPushEnabled) { 'enabled' } else { 'disabled' })"
Write-Host "Review Bridge: $bridgeState"
if ($status.lastError) {
    $lastError = (Protect-ReviewLoopMessage ([string]$status.lastError)) -replace "\r?\n", " "
    Write-Host "Last error: $lastError"
}

if ($stale) {
    Write-Host "Reason: status is running but the controller process or heartbeat is stale."
    exit 2
}
if ($status.stage -eq "failed" -or $status.stage -eq "verify_failed") { exit 1 }
exit 0
