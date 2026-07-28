[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BridgeUrl,
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][int]$PrNumber,
    [ValidateRange(5, 3600)][int]$IntervalSeconds = 30,
    [switch]$PushOnSuccess,
    [string]$PushScript = ".\scripts\push.ps1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Write-Host "Watching the Review Bridge. Press Ctrl+C to stop."

while ($true) {
    try {
        $parameters = @{
            BridgeUrl = $BridgeUrl
            Repository = $Repository
            PrNumber = $PrNumber
            PushScript = $PushScript
        }
        if ($PushOnSuccess) { $parameters.PushOnSuccess = $true }
        & "$PSScriptRoot\review-loop.ps1" @parameters
    }
    catch { Write-Warning $_.Exception.Message }
    Start-Sleep -Seconds $IntervalSeconds
}
