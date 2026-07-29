[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$bridgeUrl = "https://metheory-review-bridge.jinghaodao-tech.workers.dev"
$requiredFiles = @(
    "scripts\review-loop.ps1",
    "scripts\watch-review-loop.ps1",
    "scripts\start-review-watcher.ps1",
    "scripts\trigger-gpt-review.ps1",
    "scripts\setup-chatgpt-review-trigger.ps1",
    "scripts\check-review-loop.ps1",
    "scripts\review-loop-status-lib.ps1",
    "scripts\status-review-loop.ps1",
    "scripts\watch-review-status.ps1",
    "scripts\tail-review-loop.ps1",
    "scripts\check-review-processes.ps1",
    "custom-gpt\openapi.yaml",
    "custom-gpt\instructions.md",
    "review-trigger\src\core.js",
    "review-trigger\src\cli.js",
    "review-trigger\package.json"
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
Report-Check "CHATGPT_REVIEW_GPT_URL is configured" (-not [string]::IsNullOrWhiteSpace($env:CHATGPT_REVIEW_GPT_URL))

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
Report-Check "node is installed" ($null -ne (Get-Command node -ErrorAction SilentlyContinue))
Report-Check "npm is installed" ($null -ne (Get-Command npm.cmd -ErrorAction SilentlyContinue))

$git = Resolve-Executable "git" @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
)
Report-Check "git is installed" ($null -ne $git)

$healthOk = $false
$healthStatus = $null
if (-not [string]::IsNullOrWhiteSpace($env:REVIEW_BRIDGE_TOKEN)) {
    try {
        $previousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $healthRaw = & curl.exe -sS `
            -H "Authorization: Bearer $env:REVIEW_BRIDGE_TOKEN" `
            -w "`n__HTTP_STATUS__:%{http_code}" `
            "$bridgeUrl/health" 2>$null
        $curlExitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorAction
        if ($curlExitCode -eq 0) {
            $healthText = ($healthRaw -join "`n")
            $statusMatch = [regex]::Match($healthText, "__HTTP_STATUS__:(\d{3})$")
            if ($statusMatch.Success) {
                $healthStatus = [int]$statusMatch.Groups[1].Value
                $healthBody = $healthText.Substring(0, $statusMatch.Index).Trim()
                if ($healthStatus -eq 200) {
                    $health = $healthBody | ConvertFrom-Json
                    $healthOk = ($health.ok -eq $true -and $health.service -eq "metheory-review-bridge")
                }
            }
        }
    } catch {
        $healthOk = $false
    }
}
$healthLabel = if ($null -ne $healthStatus) { "Review Bridge health check (HTTP $healthStatus)" } else { "Review Bridge health check" }
Report-Check $healthLabel $healthOk

$openApi = Join-Path $PSScriptRoot "..\custom-gpt\openapi.yaml"
$openApiText = if (Test-Path -LiteralPath $openApi) { Get-Content -Raw $openApi } else { "" }
Report-Check "OpenAPI uses the deployed Worker URL" (
    $openApiText.Contains("https://metheory-review-bridge.jinghaodao-tech.workers.dev") -and
    -not $openApiText.Contains("REPLACE_WITH_WORKER_DOMAIN")
)

foreach ($relativePath in $requiredFiles) {
    Report-Check "file exists: $relativePath" (Test-Path -LiteralPath (Join-Path $PSScriptRoot "..\$relativePath"))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
foreach ($ignoredPath in @(".ai\review-loop-status.json", ".ai\review-loop.log", ".ai\review-loop.lock")) {
    $ignoredOutput = & $git -C $repoRoot check-ignore -q -- $ignoredPath 2>$null
    Report-Check "Git ignores $ignoredPath" ($LASTEXITCODE -eq 0)
}
$statusPath = Join-Path $repoRoot ".ai\review-loop-status.json"
if (Test-Path -LiteralPath $statusPath) {
    $statusReadable = $false
    try { Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json | Out-Null; $statusReadable = $true } catch { $statusReadable = $false }
    Report-Check "review loop status JSON is readable" $statusReadable
} else {
    Write-Host "INFO  review loop status JSON will be created when the watcher starts"
}

$profileDirectory = Join-Path $PSScriptRoot "..\.ai\chatgpt-profile"
Report-Check "dedicated ChatGPT browser profile exists" (Test-Path -LiteralPath $profileDirectory)
$playwrightDirectory = Join-Path $PSScriptRoot "..\review-trigger\node_modules\playwright-core"
Report-Check "review trigger dependencies are installed" (Test-Path -LiteralPath $playwrightDirectory)

if ($failures -gt 0) {
    Write-Host "Review loop setup check failed: $failures check(s) need attention."
    exit 1
}
Write-Host "Review loop setup check passed."
