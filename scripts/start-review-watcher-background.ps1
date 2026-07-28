[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$PrNumber
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    throw "REVIEW_BRIDGE_TOKEN is not configured in this PowerShell session."
}
if (-not (Get-Command powershell.exe -ErrorAction SilentlyContinue)) {
    throw "Windows PowerShell is required to start a background watcher."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$starter = Join-Path $PSScriptRoot "start-review-watcher.ps1"
if (-not (Test-Path -LiteralPath $starter)) {
    throw "Watcher starter not found: $starter"
}

$arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $starter,
    "-PrNumber", $PrNumber
)

if ($PSCmdlet.ShouldProcess("PR #$PrNumber", "Start a hidden background review watcher")) {
    $process = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $arguments `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -PassThru
    Write-Host "Background review watcher started for PR #$PrNumber (PID $($process.Id))."
    Write-Host "It inherits REVIEW_BRIDGE_TOKEN from this PowerShell session and does not save it to disk."
}
