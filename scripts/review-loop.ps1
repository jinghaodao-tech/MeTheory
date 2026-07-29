[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BridgeUrl,
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][int]$PrNumber,
    [string]$PushScript = ".\scripts\commit-and-push-review-fix.ps1",
    [switch]$PushOnSuccess,
    [ValidateRange(1, 5)][int]$MaxReviewCycles = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "review-loop-status-lib.ps1")

function Set-ReviewStatusSafe {
    param([Parameter(Mandatory)][string]$Stage, [hashtable]$Fields = @{}, [bool]$Running = $true)
    try {
        $existing = Get-ReviewLoopStatus
        if ($existing -and $existing.controllerPid) { $Fields.controllerPid = $existing.controllerPid }
        Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage $Stage -Running $Running -Fields $Fields
    } catch { }
}

function Get-InstructionValue {
    param([Parameter(Mandatory)]$Instruction, [Parameter(Mandatory)][string]$Name, $DefaultValue)
    $names = switch ($Name) {
        "headSha" { @("headSha", "head_sha") }
        "reviewCycle" { @("reviewCycle", "review_cycle") }
        "reviewScope" { @("reviewScope", "review_scope") }
        "blockingIssues" { @("blockingIssues", "blocking_issues") }
        "acceptanceCriteria" { @("acceptanceCriteria", "acceptance_criteria") }
        default { @($Name) }
    }
    foreach ($candidate in $names) {
        $property = $Instruction.PSObject.Properties[$candidate]
        if ($null -ne $property -and $null -ne $property.Value) { return $property.Value }
    }
    return $DefaultValue
}

function ConvertTo-ReviewInstruction {
    param([Parameter(Mandatory)]$Instruction)
    $headSha = [string](Get-InstructionValue -Instruction $Instruction -Name "headSha" -DefaultValue "")
    $id = [string](Get-InstructionValue -Instruction $Instruction -Name "id" -DefaultValue "")
    $result = [string](Get-InstructionValue -Instruction $Instruction -Name "result" -DefaultValue "")
    if ([string]::IsNullOrWhiteSpace($id) -or [string]::IsNullOrWhiteSpace($headSha) -or [string]::IsNullOrWhiteSpace($result)) {
        throw "Review Bridge returned a pending instruction without id, headSha, or result. Deploy the current Review Bridge schema before continuing."
    }
    $blockingIssues = Get-InstructionValue -Instruction $Instruction -Name "blockingIssues" -DefaultValue @()
    $acceptanceCriteria = Get-InstructionValue -Instruction $Instruction -Name "acceptanceCriteria" -DefaultValue @()
    $constraints = Get-InstructionValue -Instruction $Instruction -Name "constraints" -DefaultValue @()
    foreach ($field in @("blockingIssues", "acceptanceCriteria", "constraints")) {
        $value = Get-Variable -Name $field -ValueOnly
        if ($value -is [string]) {
            try { Set-Variable -Name $field -Value ($value | ConvertFrom-Json) } catch { Set-Variable -Name $field -Value @() }
        }
    }
    return [pscustomobject]@{
        id = $id
        repository = [string](Get-InstructionValue -Instruction $Instruction -Name "repository" -DefaultValue $Repository)
        prNumber = [int](Get-InstructionValue -Instruction $Instruction -Name "prNumber" -DefaultValue $PrNumber)
        headSha = $headSha
        result = $result
        objective = [string](Get-InstructionValue -Instruction $Instruction -Name "objective" -DefaultValue "Resolve blocking review issues")
        blockingIssues = @($blockingIssues)
        acceptanceCriteria = @($acceptanceCriteria)
        constraints = @($constraints)
        reviewCycle = [int](Get-InstructionValue -Instruction $Instruction -Name "reviewCycle" -DefaultValue 1)
        reviewScope = [string](Get-InstructionValue -Instruction $Instruction -Name "reviewScope" -DefaultValue "pr")
    }
}

function Test-BridgeNoContent {
    param($Value)
    if ($null -eq $Value) { return $true }
    if ($Value -is [string]) { return [string]::IsNullOrWhiteSpace($Value) }
    return @($Value.PSObject.Properties).Count -eq 0
}

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
    "C:\Program Files (x86)\Git\cmd\git.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
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
    return (Get-CurrentPrInfo).headRefOid
}

function Get-CurrentPrInfo {
    $raw = & $gh pr view $PrNumber --repo $Repository --json headRefOid,headRefName
    if ($LASTEXITCODE -ne 0) { throw "Could not get the current PR head SHA." }
    return $raw | ConvertFrom-Json
}

function Get-HeadSha {
    $sha = (& $git rev-parse HEAD 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $sha) { throw "Could not determine the checked-out HEAD SHA." }
    return $sha
}

function Get-CurrentBranch {
    $branch = (& $git branch --show-current 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $branch) { throw "Could not determine the current branch." }
    return $branch
}

function Assert-CleanWorkingTree {
    $changes = @(& $git status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect the working tree." }
    if ($changes.Count -gt 0) { throw "Working tree is not clean; refusing to mix existing changes with an automated review commit." }
}

function Set-ReviewHead {
    param(
        [Parameter(Mandatory)][string]$HeadSha,
        [Parameter(Mandatory)][string]$Branch
    )
    Assert-CleanWorkingTree
    if ((Get-CurrentBranch) -ne $Branch) {
        & $git fetch --no-tags origin $Branch
        if ($LASTEXITCODE -ne 0) { throw "Could not fetch PR branch $Branch." }
        & $git checkout $Branch
        if ($LASTEXITCODE -ne 0) { throw "Could not check out PR branch $Branch." }
    }
    if ((Get-HeadSha) -ne $HeadSha) { throw "Checked-out PR branch does not match the reviewed PR SHA." }
}

function Convert-InstructionToPrompt {
    param([Parameter(Mandatory)]$Instruction)
    $issues = @($Instruction.blockingIssues | ForEach-Object {
        "- File: $($_.file)`n  Problem: $($_.problem)`n  Required outcome: $($_.requiredOutcome)"
    }) -join "`n"
    $criteria = @($Instruction.acceptanceCriteria | ForEach-Object { "- $_" }) -join "`n"
    $constraints = @($Instruction.constraints | ForEach-Object { "- $_" }) -join "`n"
    $reviewScope = Get-InstructionValue -Instruction $Instruction -Name "reviewScope" -DefaultValue "pr"
    $reviewCycle = Get-InstructionValue -Instruction $Instruction -Name "reviewCycle" -DefaultValue 1
    return @"
# Objective
$($Instruction.objective)

# Target
- Repository: $($Instruction.repository)
- PR: #$($Instruction.prNumber)
- Review head SHA: $($Instruction.headSha)
- Review cycle: $reviewCycle
- Review scope: $reviewScope

# Blocking issues
$issues

# Acceptance criteria
$criteria

# Constraints
$constraints
- Make only the smallest changes directly related to the current PR diff.
- Do not run the full npm run verify; the external PowerShell controller runs it.
- Do not run git commit, git push, branch creation, or merge commands.
- Optional suggestions are informational only and are not automatic work.
- Report changed files and addressed issues when finished.
"@
}

$repoRoot = $null
$probe = (Get-Location).Path
while ($probe) {
    if (Test-Path -LiteralPath (Join-Path $probe ".git")) {
        $repoRoot = $probe
        break
    }
    $parent = Split-Path -Parent $probe
    if (-not $parent -or $parent -eq $probe) { break }
    $probe = $parent
}
if (-not $repoRoot) { throw "Run this script inside a Git repository." }
Set-Location $repoRoot
Set-ReviewStatusSafe -Stage "checking_pr" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; automaticPushEnabled = $PushOnSuccess; nextAction = "Checking the current PR head SHA" }
Write-ReviewLoopLog -Stage "checking_pr" -Message "Checking PR head SHA."

$encodedRepository = [uri]::EscapeDataString($Repository)
$instruction = Invoke-Bridge -Method GET -Path "/api/review-instructions/latest?repository=$encodedRepository&prNumber=$PrNumber&status=pending" -Body $null
if (Test-BridgeNoContent $instruction) {
    Set-ReviewStatusSafe -Stage "waiting_for_next_sha" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; automaticPushEnabled = $PushOnSuccess; nextAction = "Waiting for a pending review instruction" }
    Write-ReviewLoopLog -Stage "waiting_for_next_sha" -Message "No pending review instruction."
    Write-Host "No pending review instruction."; exit 0
}
$instruction = ConvertTo-ReviewInstruction -Instruction $instruction
$instructionReviewCycle = [int](Get-InstructionValue -Instruction $instruction -Name "reviewCycle" -DefaultValue 1)
$instructionReviewScope = [string](Get-InstructionValue -Instruction $instruction -Name "reviewScope" -DefaultValue "pr")
if ($instructionReviewCycle -gt $MaxReviewCycles) { Write-Warning "Review cycle limit exceeded; human review is required."; exit 2 }

$currentPr = Get-CurrentPrInfo
$currentSha = $currentPr.headRefOid
Set-ReviewStatusSafe -Stage "checking_pr" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $currentSha; reviewScope = $instructionReviewScope; reviewCycle = $instructionReviewCycle; automaticPushEnabled = $PushOnSuccess; nextAction = "Comparing the pending review SHA" }
if ($currentSha -ne $instruction.headSha) {
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/stale" -Body @{} | Out-Null
    Set-ReviewStatusSafe -Stage "waiting_for_next_sha" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $currentSha; automaticPushEnabled = $PushOnSuccess; nextAction = "Waiting for a review for the new PR SHA" }
    Write-ReviewLoopLog -Level warn -Stage "waiting_for_next_sha" -Message "Review SHA is stale; no Codex process was started."
    Write-Warning "Review SHA is stale; no Codex process was started."
    exit 3
}
Set-ReviewHead -HeadSha $instruction.headSha -Branch $currentPr.headRefName

if ($instruction.result -eq "pass") {
    Set-ReviewStatusSafe -Stage "review_received" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $instruction.headSha; reviewScope = $instructionReviewScope; reviewCycle = $instructionReviewCycle; automaticPushEnabled = $PushOnSuccess; nextAction = "Completing the passing review" }
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/claim" -Body @{} | Out-Null
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/complete" -Body @{} | Out-Null
    Set-ReviewStatusSafe -Stage "completed" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $instruction.headSha; automaticPushEnabled = $PushOnSuccess; nextAction = "Waiting for the next PR SHA" }
    Write-ReviewLoopLog -Stage "completed" -Message "Review passed; Codex was not started."
    Write-Host "Review passed; Codex was not started."
    exit 0
}

Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/claim" -Body @{} | Out-Null
Set-ReviewStatusSafe -Stage "claiming_review" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $instruction.headSha; reviewScope = $instructionReviewScope; reviewCycle = $instructionReviewCycle; automaticPushEnabled = $PushOnSuccess; nextAction = "Starting Codex with blocking issues only" }
if ((Get-CurrentPrSha) -ne $instruction.headSha) {
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/stale" -Body @{} | Out-Null
    Write-Warning "Review SHA became stale after claim; no Codex process was started."
    exit 3
}
if ((Get-HeadSha) -ne $instruction.headSha) { throw "Checked-out HEAD drifted before Codex execution." }
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path ".ai\runs" $runId
New-Item -ItemType Directory -Force $runDir | Out-Null
$promptPath = Join-Path $runDir "review-fix.md"
Convert-InstructionToPrompt $instruction | Set-Content $promptPath -Encoding utf8

try {
    Set-ReviewStatusSafe -Stage "codex_running" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $instruction.headSha; reviewScope = $instructionReviewScope; reviewCycle = $instructionReviewCycle; childCommand = "codex exec"; automaticPushEnabled = $PushOnSuccess; nextAction = "Applying blocking review fixes" }
    Write-ReviewLoopLog -Stage "codex_running" -Message "Starting Codex for blocking review issues."
    Get-Content $promptPath -Raw | & $codex exec --sandbox workspace-write -
    if ($LASTEXITCODE -ne 0) { throw "Codex execution failed." }
    if ((Get-CurrentPrSha) -ne $instruction.headSha) { throw "PR head SHA changed during Codex execution." }
    if ((Get-HeadSha) -ne $instruction.headSha) { throw "Codex left the checkout on a different HEAD SHA." }
    Set-ReviewStatusSafe -Stage "running_verify" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $instruction.headSha; childPid = $null; childCommand = "npm run verify"; automaticPushEnabled = $PushOnSuccess; nextAction = "Running external npm run verify" }
    Write-ReviewLoopLog -Stage "running_verify" -Message "Running external npm run verify."
    npm run verify
    if ($LASTEXITCODE -ne 0) { throw "npm run verify failed." }
    $completedHeadSha = $instruction.headSha
    if ($PushOnSuccess) {
        Set-ReviewStatusSafe -Stage "running_push" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $instruction.headSha; childPid = $null; childCommand = "push script"; automaticPushEnabled = $true; nextAction = "Pushing the verified working branch" }
        Write-ReviewLoopLog -Stage "running_push" -Message "Running the explicitly enabled push script."
        $branch = Get-CurrentBranch
        if ($branch -in @("main", "master")) {
            throw "Automatic push is disabled on the main/master branch."
        }
        if (-not (Test-Path -LiteralPath $PushScript)) { throw "Push script not found: $PushScript" }
        $pushResult = & $PushScript -ExpectedHeadSha $instruction.headSha -PrNumber $PrNumber
        if ($LASTEXITCODE -ne 0) { throw "Push script failed." }
        $pushResult = $pushResult | ConvertFrom-Json
        if ($pushResult.committed) {
            $completedHeadSha = [string]$pushResult.headSha
            $updatedPrSha = Get-CurrentPrSha
            if ($updatedPrSha -ne $completedHeadSha) { throw "Push completed but the PR head SHA did not update to the review commit." }
        }
    }
    if (-not $PushOnSuccess -and (Get-CurrentPrSha) -ne $instruction.headSha) { throw "PR head SHA changed before completion." }
    if (-not $PushOnSuccess -and (Get-HeadSha) -ne $instruction.headSha) { throw "Checked-out HEAD changed before completion." }
    Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/complete" -Body @{} | Out-Null
    $nextAction = if ($PushOnSuccess -and $completedHeadSha -ne $instruction.headSha) { "Waiting for the next GPT review of the pushed PR SHA" } else { "Review completed locally; commit and push manually to start another review cycle" }
    Set-ReviewStatusSafe -Stage "completed" -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $completedHeadSha; childPid = $null; childCommand = $null; automaticPushEnabled = $PushOnSuccess; nextAction = $nextAction }
    Write-ReviewLoopLog -Stage "completed" -Message "Review fix and verification completed."
    Write-Host "Review fix and verification completed."
}
catch {
    $failureStage = if ($_.Exception.Message -match "verify") { "verify_failed" } else { "failed" }
    Set-ReviewStatusSafe -Stage $failureStage -Running $false -Fields @{ controllerPid = $PID; branch = Get-CurrentBranch; headSha = $instruction.headSha; childPid = $null; childCommand = $null; automaticPushEnabled = $PushOnSuccess; lastError = $_.Exception.Message; nextAction = "Human investigation is required" }
    Write-ReviewLoopLog -Level error -Stage $failureStage -Message $_.Exception.Message
    try { Invoke-Bridge -Method POST -Path "/api/review-instructions/$($instruction.id)/fail" -Body @{ message = $_.Exception.Message } | Out-Null } catch { Write-Warning "Could not mark review instruction as failed: $($_.Exception.Message)" }
    throw
}
