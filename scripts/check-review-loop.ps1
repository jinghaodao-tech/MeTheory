[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$bridgeUrl = "https://metheory-review-bridge.jinghaodao-tech.workers.dev"
$requiredFiles = @(
    "scripts\review-loop.ps1",
    "scripts\watch-review-loop.ps1",
    "scripts\start-review-watcher.ps1",
    "scripts\check-review-loop.ps1",
    "custom-gpt\openapi.yaml",
    "custom-gpt\instructions.md"
)

$failures = 0
function Resolve-Executable {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string[]]$Candidates
    )
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) { return $command.Source }
    foreach ($candidate in $Candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Report-Check {
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][bool]$Ok)
    if ($Ok) {
        Write-Host "OK  $Name"
    } else {
        Write-Host "NG  $Name"
        $script:failures++
    }
}

Report-Check "REVIEW_BRIDGE_TOKEN is configured" (-not [string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN))

$gh = Resolve-Executable "gh" @(
    "C:\Program Files\GitHub CLI\gh.exe",
    "C:\Program Files (x86)\GitHub CLI\gh.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI\gh.exe")
)
Report-Check "gh is installed" ($null -ne $gh)
if ($null -ne $gh) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $gh auth status *> $null
    $ghAuthExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
    Report-Check "gh auth status succeeds" ($ghAuthExitCode -eq 0)
} else {
    Report-Check "gh auth status succeeds" $false
}

$codex = Resolve-Executable "codex" @(
    (Join-Path $env:APPDATA "npm\codex.cmd"),
    (Join-Path $env:APPDATA "npm\codex.ps1"),
    (Join-Path $env:APPDATA "npm\codex.exe")
)
Report-Check "codex is installed" ($null -ne $codex)

$healthOk = $false
if (-not [string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    try {
        $previousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $healthRaw = & curl.exe -sS `
            -H "Authorization: Bearer $env:REVIEW_BRIDGE_TOKEN" `
            "$bridgeUrl/health" 2>$null
        $curlExitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorAction
        if ($curlExitCode -eq 0) {
            $health = $healthRaw | ConvertFrom-Json
            $healthOk = ($health.ok -eq $true -and $health.service -eq "metheory-review-bridge")
        }
    } catch {
        $healthOk = $false
    }
}
Report-Check "Review Bridge health check" $healthOk

$openApi = Join-Path $PSScriptRoot "..\custom-gpt\openapi.yaml"
$openApiText = if (Test-Path -LiteralPath $openApi) { Get-Content -Raw $openApi } else { "" }
Report-Check "OpenAPI uses the deployed Worker URL" (
    $openApiText.Contains("https://metheory-review-bridge.jinghaodao-tech.workers.dev") -and
    -not $openApiText.Contains("REPLACE_WITH_WORKER_DOMAIN")
)

foreach ($relativePath in $requiredFiles) {
    Report-Check "file exists: $relativePath" (Test-Path -LiteralPath (Join-Path $PSScriptRoot "..\$relativePath"))
}

if ($failures -gt 0) {
    Write-Host "Review loop setup check failed: $failures check(s) need attention."
    exit 1
}
Write-Host "Review loop setup check passed."
