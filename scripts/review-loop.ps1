[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BridgeUrl,
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][int]$PrNumber,
    [string]$PushScript = ".\scripts\push.ps1",
    [switch]$PushOnSuccess,
    [ValidateRange(1, 5)][int]$MaxReviewCycles = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
    throw "$Name command is required."
}

$git = Resolve-Executable "git" @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe"
)
$gh = Resolve-Executable "gh" @(
    "C:\Program Files\GitHub CLI\gh.exe",
    "C:\Program Files (x86)\GitHub CLI\gh.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI\gh.exe")
)
$codex = Resolve-Executable "codex" @(
    (Join-Path $env:APPDATA "npm\codex.cmd"),
    (Join-Path $env:APPDATA "npm\codex.ps1"),
    (Join-Path $env:APPDATA "npm\codex.exe")
)

function Invoke-Bridge {
    param([Parameter(Mandatory)][string]$Method, [Parameter(Mandatory)][string]$Path, [object]$Body)
    if (-not $env:REVIEW_BRIDGE_TOKEN) { throw "REVIEW_BRIDGE_TOKEN is not configured." }
    $request = @{
        Method = $Method
        Uri = "$($BridgeUrl.TrimEnd('/'))$Path"
        Headers = @{ Authorization = "Bearer $env:REVIEW_BRIDGE_TOKEN" }
    }
    if ($null -ne $Body) {
        $request.ContentType = "application/json"
        $request.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }
    try { return Invoke-RestMethod @request }
    catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 204) { return $null }
        throw
    }
}

function Get-CurrentPrSha {
    $raw = & $gh pr view $PrNumber --repo $Repository --json headRefOid
    if ($LASTEXITCODE -ne 0) { throw "Could not get the current PR head SHA." }
    return ($raw | ConvertFrom-Json).headRefOid
}

function Get-CurrentBranch {
    $branch = (& $git branch --show-current 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $branch) { throw "Could not determine the current branch." }
    return $branch
}

function Convert-InstructionToPrompt {
    param([Parameter(Mandatory)]$Instruction)
    $issues = @($Instruction.blockingIssues | ForEach-Object {
        "- File: $($_.file)`n  Problem: $($_.problem)`n  Required outcome: $($_.requiredOutcome)"
    }) -join "`n"
    $criteria = @($Instruction.acceptanceCriteria | ForEach-Object { "- $_" }) -join "`n"
    $constraints = @($Instruction.constraints | ForEach-Object { "- $_" }) -join "`n"
    return @"
# Objective
$($Instruction.objective)

# Target
- Repository: $($Instruction.repository)
- PR: #$($Instruction.prNumber)
- Review head SHA: $($Instruction.headSha)
- Review cycle: $($Instruction.reviewCycle)

# Blocking issues
$issues

# Acceptance criteria
$criteria

# Constraints
$constraints
- Make only the smallest changes directly related to the current PR diff.
- Do not run the full npm run verify; the external PowerShell controller runs it.
- Do not run git commit, git push, branch creation, or merge commands.
- Report changed files and addressed issues when finished.
"@
}

$repoRoot = (& $git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { throw "Run this script inside a Git repository." }
Set-Location $repoRoot

$encodedRepository = [uri]::EscapeDataString($Repository)
$instruction = Invoke-Bridge -Method GET -Path "/api/review-instructions/latest?repository=$encodedRepository&prNumber=$PrNumber&status=pending" -Body $null
if ($null -eq $instruction) { Write-Host "No pending review instruction."; exit 0 }
if ([int]$instruction.reviewCycle -gt $MaxReviewCycles) { Write-Warning "Review cycle limit exceeded; human review is required."; exit 2 }

$currentSha = Get-CurrentPrSha
if ($currentSha -ne $instruction.headSha) {
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/stale" -Body @{} | Out-Null
    Write-Warning "Review SHA is stale; no Codex process was started."
    exit 3
}

if ($instruction.result -eq "pass") {
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/claim" -Body @{} | Out-Null
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/complete" -Body @{} | Out-Null
    Write-Host "Review passed; Codex was not started."
    exit 0
}

Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/claim" -Body @{} | Out-Null
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path ".ai\runs" $runId
New-Item -ItemType Directory -Force $runDir | Out-Null
$promptPath = Join-Path $runDir "review-fix.md"
Convert-InstructionToPrompt $instruction | Set-Content $promptPath -Encoding utf8

try {
    Get-Content $promptPath -Raw | & $codex exec --sandbox workspace-write -
    if ($LASTEXITCODE -ne 0) { throw "Codex execution failed." }
    npm run verify
    if ($LASTEXITCODE -ne 0) { throw "npm run verify failed." }
    if ($PushOnSuccess) {
        $branch = Get-CurrentBranch
        if ($branch -in @("main", "master")) {
            throw "Automatic push is disabled on the main/master branch."
        }
        if (-not (Test-Path -LiteralPath $PushScript)) { throw "Push script not found: $PushScript" }
        & $PushScript
        if ($LASTEXITCODE -ne 0) { throw "Push script failed." }
    }
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/complete" -Body @{} | Out-Null
    Write-Host "Review fix and verification completed."
}
catch {
    try { Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/fail" -Body @{ message = $_.Exception.Message } | Out-Null } catch { Write-Warning "Could not mark review instruction as failed: $($_.Exception.Message)" }
    throw
}
