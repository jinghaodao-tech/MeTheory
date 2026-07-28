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

$gh = Get-Command gh -ErrorAction SilentlyContinue
Report-Check "gh is installed" ($null -ne $gh)
if ($null -ne $gh) {
    gh auth status *> $null
    Report-Check "gh auth status succeeds" ($LASTEXITCODE -eq 0)
} else {
    Report-Check "gh auth status succeeds" $false
}

$codex = Get-Command codex -ErrorAction SilentlyContinue
Report-Check "codex is installed" ($null -ne $codex)

$healthOk = $false
if (-not [string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    try {
        $health = Invoke-RestMethod `
            -Method Get `
            -Uri "$bridgeUrl/health" `
            -Headers @{ Authorization = "Bearer $env:REVIEW_BRIDGE_TOKEN" }
        $healthOk = ($health.ok -eq $true -and $health.service -eq "metheory-review-bridge")
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
