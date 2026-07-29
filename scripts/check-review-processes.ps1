[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "review-loop-status-lib.ps1")

$status = Get-ReviewLoopStatus
if ($null -eq $status) { Write-Host "Review loop status is missing or unreadable."; exit 3 }

function Show-Process {
    param([Parameter(Mandatory)][int]$Id, [Parameter(Mandatory)][string]$Role)
    $process = Get-Process -Id $Id -ErrorAction SilentlyContinue
    if ($null -eq $process) { Write-Host "MISSING $Role PID $Id"; return $false }
    Write-Host ("RUNNING {0} PID {1} started {2:u}" -f $Role, $process.Id, $process.StartTime)
    return $true
}

$found = $false
$found = (Show-Process -Id ([int]$status.controllerPid) -Role "watcher controller") -or $found
if ($status.childPid) { $found = (Show-Process -Id ([int]$status.childPid) -Role ([string]$status.childCommand)) -or $found }

$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
$seen = @{}
foreach ($process in $processes) {
    $commandLine = [string]$process.CommandLine
    $role = $null
    if ($commandLine -match "review-trigger[\\/]src[\\/]cli\.js") { $role = "Node review-trigger" }
    elseif ($commandLine -match "codex(?:\.cmd|\.exe)?\s+exec") { $role = "Codex CLI" }
    elseif ($commandLine -match "npm(?:\.cmd)?\s+run\s+verify") { $role = "npm verify" }
    elseif ($commandLine -match "chatgpt-profile") { $role = "Chrome/Edge ChatGPT profile" }
    $key = "${role}:$($process.ProcessId)"
    if (-not $role -or $seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $native = Get-Process -Id ([int]$process.ProcessId) -ErrorAction SilentlyContinue
    if ($native) { Write-Host ("FOUND {0} PID {1} started {2:u}" -f $role, $native.Id, $native.StartTime) }
}
Write-Host "Process inspection does not print command-line arguments, tokens, cookies, or prompts."
if (-not $found -and $status.running) { exit 2 }
exit 0
