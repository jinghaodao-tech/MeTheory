[CmdletBinding()]
param([ValidateRange(1, 100)][int]$Lines = 20)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$logPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".ai\review-loop.log"
if (-not (Test-Path -LiteralPath $logPath)) { Write-Host "Review loop log is missing: $logPath"; exit 3 }
Get-Content -LiteralPath $logPath -Tail $Lines -Wait
