[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BridgeUrl,
    [Parameter(Mandatory)][string]$Repository,
    [Parameter(Mandatory)][int]$PrNumber,
    [ValidateRange(5, 3600)][int]$IntervalSeconds = 30,
    [switch]$AutoTriggerReview,
    [switch]$FullRepositoryReview,
    [switch]$ForceReview,
    [string]$CustomGptUrl = $env:CHATGPT_REVIEW_GPT_URL,
    [ValidateRange(5, 3600)][int]$ReviewDebounceSeconds = 90,
    [ValidateRange(60, 86400)][int]$ReviewRetryCooldownSeconds = 1800,
    [ValidateRange(30, 3600)][int]$ReviewResultTimeoutSeconds = 600,
    [switch]$PushOnSuccess,
    [string]$PushScript = ".\scripts\commit-and-push-review-fix.ps1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "review-loop-status-lib.ps1")

$repoRoot = Split-Path -Parent $PSScriptRoot
$terminalStage = $null
$gitCandidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
)
$gitExecutable = if (Get-Command git -ErrorAction SilentlyContinue) { (Get-Command git).Source } else { $gitCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $gitExecutable) { throw "Git is required. Add Git to PATH or install it in a standard location." }

function Get-CurrentBranchName {
    $value = (& $gitExecutable branch --show-current 2>$null).Trim()
    if ($LASTEXITCODE -eq 0 -and $value) { return $value }
    return $null
}

function ConvertTo-PowerShellLiteral {
    param([AllowEmptyString()][string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Invoke-ChildScript {
    param(
        [Parameter(Mandatory)][string]$ScriptPath,
        [Parameter(Mandatory)][string[]]$ScriptArguments,
        [Parameter(Mandatory)][string]$Stage,
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string]$NextAction
    )
    Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage $Stage -Fields @{
        controllerPid = $PID; childPid = $null; childCommand = $Command; reviewScope = if ($FullRepositoryReview) { "repository" } else { "pr" }; automaticPushEnabled = $PushOnSuccess; nextAction = $NextAction
    }
    Write-ReviewLoopLog -Stage $Stage -Message "Starting review child process."
    # -EncodedCommand keeps the repository's Japanese path intact for Windows PowerShell child processes.
    $encodedArguments = foreach ($argument in $ScriptArguments) {
        $text = [string]$argument
        if ($text -match '^-[A-Za-z]') { $text } else { ConvertTo-PowerShellLiteral $text }
    }
    $childPreamble = '$ProgressPreference=''SilentlyContinue''; $InformationPreference=''SilentlyContinue''; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; '
    $invocation = "$childPreamble& $(ConvertTo-PowerShellLiteral $ScriptPath) $($encodedArguments -join ' ')"
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($invocation))
    $captureError = $Command -eq "ChatGPT review trigger"
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "powershell.exe"
    $processInfo.Arguments = "-NoProfile -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand $encodedCommand"
    $processInfo.WorkingDirectory = $repoRoot
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.RedirectStandardOutput = $captureError
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    if (-not $process.Start()) { throw "$Command could not be started." }
    Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage $Stage -Fields @{
        controllerPid = $PID; childPid = $process.Id; childCommand = $Command; reviewScope = if ($FullRepositoryReview) { "repository" } else { "pr" }; automaticPushEnabled = $PushOnSuccess; nextAction = $NextAction
    }
    while (-not $process.HasExited) {
        Start-Sleep -Seconds 10
        Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage $Stage -Fields @{
            controllerPid = $PID; childPid = $process.Id; childCommand = $Command; reviewScope = if ($FullRepositoryReview) { "repository" } else { "pr" }; automaticPushEnabled = $PushOnSuccess; nextAction = $NextAction
        }
    }
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    if ($null -eq $exitCode -or [string]::IsNullOrWhiteSpace([string]$exitCode)) { $exitCode = -1 }
    Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage $Stage -Fields @{
        controllerPid = $PID; childPid = $null; childCommand = $null; reviewScope = if ($FullRepositoryReview) { "repository" } else { "pr" }; automaticPushEnabled = $PushOnSuccess; nextAction = $NextAction
    }
    $diagnostic = ""
    $rawDiagnostic = $process.StandardError.ReadToEnd()
    if ($null -ne $rawDiagnostic) { $diagnostic = Protect-ReviewLoopMessage ([string]$rawDiagnostic.Trim()) }
    $childOutput = ""
    if ($captureError) {
        $rawOutput = $process.StandardOutput.ReadToEnd()
        if ($null -ne $rawOutput) { $childOutput = Protect-ReviewLoopMessage ([string]$rawOutput.Trim()) }
    }
    $process.Dispose()
    if ($exitCode -ne 0) {
        if ($diagnostic) { throw "$Command exited with code $exitCode. $diagnostic" }
        throw "$Command exited with code $exitCode."
    }
    if ($childOutput) { Write-ReviewLoopLog -Stage $Stage -Message "$Command output: $childOutput" }
}

try {
    New-ReviewLoopLock -PrNumber $PrNumber
    $startedAt = (Get-Date).ToUniversalTime().ToString("o")
    Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage "starting" -Fields @{
        controllerPid = $PID; startedAt = $startedAt; bridgeUrl = $BridgeUrl; branch = Get-CurrentBranchName; reviewScope = if ($FullRepositoryReview) { "repository" } else { "pr" }; automaticPushEnabled = $PushOnSuccess; nextAction = "Starting the review loop"
    }
    Write-ReviewLoopLog -Stage "starting" -Message "Review watcher started."
    if ($ForceReview) { Write-ReviewLoopLog -Stage "starting" -Message "A forced ChatGPT review was requested for the current PR SHA." }
    Write-Host "Watching the Review Bridge. Press Ctrl+C to stop."
    if ($AutoTriggerReview) {
        if ([string]::IsNullOrWhiteSpace($CustomGptUrl)) { throw "AutoTriggerReview requires CHATGPT_REVIEW_GPT_URL or -CustomGptUrl." }
        Write-Host "Automatic custom GPT review requests are enabled. Login and Action approval are never auto-clicked."
    }

    $nextPoll = Get-Date
    $forceReviewPending = $ForceReview
    while ($true) {
        Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage "waiting_for_next_sha" -Fields @{
            controllerPid = $PID; branch = Get-CurrentBranchName; reviewScope = if ($FullRepositoryReview) { "repository" } else { "pr" }; automaticPushEnabled = $PushOnSuccess; nextAction = "Waiting for the next review poll"
        }
        if ((Get-Date) -ge $nextPoll) {
            if ($AutoTriggerReview) {
                $requestedReviewScope = if ($FullRepositoryReview) { "repository" } else { "pr" }
                $triggerArgs = @(
                    "-BridgeUrl", $BridgeUrl, "-Repository", $Repository, "-PrNumber", $PrNumber,
                    "-CustomGptUrl", $CustomGptUrl, "-ReviewScope", $requestedReviewScope,
                    "-DebounceSeconds", $ReviewDebounceSeconds, "-RetryCooldownSeconds", $ReviewRetryCooldownSeconds,
                    "-ResultTimeoutSeconds", $ReviewResultTimeoutSeconds
                )
                if ($forceReviewPending) {
                    $triggerArgs += "-ForceReview"
                }
                Invoke-ChildScript -ScriptPath (Join-Path $PSScriptRoot "trigger-gpt-review.ps1") -ScriptArguments $triggerArgs -Stage "waiting_for_gpt_review" -Command "ChatGPT review trigger" -NextAction "Waiting for the custom GPT to save a review result"
                if ($forceReviewPending) { $forceReviewPending = $false }
            }
            $loopArgs = @("-BridgeUrl", $BridgeUrl, "-Repository", $Repository, "-PrNumber", $PrNumber, "-PushScript", $PushScript)
            if ($PushOnSuccess) { $loopArgs += "-PushOnSuccess" }
            Invoke-ChildScript -ScriptPath (Join-Path $PSScriptRoot "review-loop.ps1") -ScriptArguments $loopArgs -Stage "checking_pr" -Command "review-loop.ps1" -NextAction "Checking the pending Review Bridge instruction"
            $nextPoll = (Get-Date).AddSeconds($IntervalSeconds)
        }
        Start-Sleep -Seconds 10
    }
}
catch {
    $terminalStage = "failed"
    Write-ReviewLoopLog -Level error -Stage "failed" -Message $_.Exception.Message
    Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage "failed" -Running $false -Fields @{
        controllerPid = $PID; childPid = $null; childCommand = $null; branch = Get-CurrentBranchName; automaticPushEnabled = $PushOnSuccess; lastError = $_.Exception.Message; nextAction = "Human investigation is required"
    }
    throw
}
finally {
    Remove-ReviewLoopLock
    if ($terminalStage -ne "failed") {
        Write-ReviewLoopLog -Stage "stopped" -Message "Review watcher stopped."
        Write-ReviewLoopStatus -Repository $Repository -PrNumber $PrNumber -Stage "stopped" -Running $false -Fields @{
            controllerPid = $PID; childPid = $null; childCommand = $null; branch = Get-CurrentBranchName; automaticPushEnabled = $PushOnSuccess; nextAction = "Start the watcher again when needed"
        }
    }
}
