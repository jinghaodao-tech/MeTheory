[CmdletBinding()]
param([ValidateRange(1, 3600)][int]$IntervalSeconds = 2)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$statusScript = Join-Path $PSScriptRoot "status-review-loop.ps1"
while ($true) {
    Clear-Host
    Write-Host (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    & $statusScript
    Start-Sleep -Seconds $IntervalSeconds
}
