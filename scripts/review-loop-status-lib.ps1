Set-StrictMode -Version Latest

$script:ReviewLoopRoot = Split-Path -Parent $PSScriptRoot
$script:ReviewLoopStateDirectory = Join-Path $script:ReviewLoopRoot ".ai"
$script:ReviewLoopStatusPath = Join-Path $script:ReviewLoopStateDirectory "review-loop-status.json"
$script:ReviewLoopLogPath = Join-Path $script:ReviewLoopStateDirectory "review-loop.log"
$script:ReviewLoopLockPath = Join-Path $script:ReviewLoopStateDirectory "review-loop.lock"
$script:ReviewLoopMaxLogBytes = 5MB

function Ensure-ReviewLoopStateDirectory {
    New-Item -ItemType Directory -Force -Path $script:ReviewLoopStateDirectory | Out-Null
}

function Protect-ReviewLoopMessage {
    param([AllowEmptyString()][string]$Message)
    $safe = $Message
    # Native PowerShell progress records are serialized as CLIXML when stderr is
    # redirected. They are not actionable diagnostics and can garble status JSON.
    $safe = [regex]::Replace($safe, "(?s)\r?\n?#< CLIXML.*$", "")
    $safe = [regex]::Replace($safe, "(?s)\r?\n?<Objs\b.*$", "")
    $safe = [regex]::Replace($safe, "[\x00-\x08\x0B\x0C\x0E-\x1F]", "")
    foreach ($name in @("REVIEW_BRIDGE_TOKEN", "GITHUB_TOKEN")) {
        $secret = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrEmpty($secret)) { $safe = $safe.Replace($secret, "[REDACTED]") }
    }
    $safe = [regex]::Replace($safe, "(?i)authorization\s*:\s*bearer\s+[^\s]+", "Authorization: Bearer [REDACTED]")
    return $safe.Trim().Substring(0, [Math]::Min($safe.Trim().Length, 1000))
}

function Write-ReviewLoopLog {
    param(
        [ValidateSet("info", "warn", "error")][string]$Level = "info",
        [Parameter(Mandatory)][string]$Stage,
        [Parameter(Mandatory)][string]$Message
    )
    Ensure-ReviewLoopStateDirectory
    if (Test-Path -LiteralPath $script:ReviewLoopLogPath) {
        if ((Get-Item -LiteralPath $script:ReviewLoopLogPath).Length -ge $script:ReviewLoopMaxLogBytes) {
            Remove-Item -LiteralPath (Join-Path $script:ReviewLoopStateDirectory "review-loop.log.2") -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath (Join-Path $script:ReviewLoopStateDirectory "review-loop.log.1") -Destination (Join-Path $script:ReviewLoopStateDirectory "review-loop.log.2") -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath $script:ReviewLoopLogPath -Destination (Join-Path $script:ReviewLoopStateDirectory "review-loop.log.1") -Force
        }
    }
    $entry = [ordered]@{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        level = $Level
        stage = $Stage
        message = Protect-ReviewLoopMessage $Message
    }
    Add-Content -LiteralPath $script:ReviewLoopLogPath -Value ($entry | ConvertTo-Json -Compress) -Encoding utf8
}

function Get-ReviewLoopStatus {
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        if (Test-Path -LiteralPath $script:ReviewLoopStatusPath) {
            try {
                $status = Get-Content -LiteralPath $script:ReviewLoopStatusPath -Raw -Encoding utf8 | ConvertFrom-Json -ErrorAction Stop
                if ($status.lastError) { $status.lastError = Protect-ReviewLoopMessage ([string]$status.lastError) }
                if ($status.nextAction) { $status.nextAction = Protect-ReviewLoopMessage ([string]$status.nextAction) }
                return $status
            } catch {
                return [pscustomobject]@{
                    schemaVersion = 1; running = $false; controllerPid = $null; repository = $null; prNumber = $null
                    bridgeUrl = $null; branch = $null; headSha = $null; reviewScope = $null; reviewCycle = $null
                    stage = "failed"; stageStartedAt = $null; lastHeartbeatAt = $null; childPid = $null; childCommand = $null
                    automaticPushEnabled = $false; nextAction = "Remove the invalid status file and restart the watcher."
                    lastError = "Review loop status could not be read as UTF-8 JSON."
                }
            }
        }
        Start-Sleep -Milliseconds 50
    }
    return $null
}

function Write-ReviewLoopStatus {
    param(
        [Parameter(Mandatory)][string]$Repository,
        [Parameter(Mandatory)][int]$PrNumber,
        [Parameter(Mandatory)][ValidateSet("starting", "checking_pr", "waiting_for_sha_stability", "opening_chatgpt", "waiting_for_chatgpt_login", "submitting_gpt_prompt", "waiting_for_action_approval", "waiting_for_gpt_review", "review_received", "claiming_review", "starting_codex", "codex_running", "running_verify", "verify_failed", "running_push", "waiting_for_next_sha", "completed", "failed", "stopped")][string]$Stage,
        [bool]$Running = $true,
        [hashtable]$Fields = @{}
    )
    Ensure-ReviewLoopStateDirectory
    $current = Get-ReviewLoopStatus
    $status = [ordered]@{
        schemaVersion = 1
        running = $Running
        controllerPid = if ($Fields.ContainsKey("controllerPid")) { $Fields.controllerPid } elseif ($current) { $current.controllerPid } else { $PID }
        repository = $Repository
        prNumber = $PrNumber
        bridgeUrl = if ($Fields.ContainsKey("bridgeUrl")) { $Fields.bridgeUrl } elseif ($current) { $current.bridgeUrl } else { "https://metheory-review-bridge.jinghaodao-tech.workers.dev" }
        branch = if ($Fields.ContainsKey("branch")) { $Fields.branch } elseif ($current) { $current.branch } else { $null }
        headSha = if ($Fields.ContainsKey("headSha")) { $Fields.headSha } elseif ($current) { $current.headSha } else { $null }
        reviewScope = if ($Fields.ContainsKey("reviewScope")) { $Fields.reviewScope } elseif ($current) { $current.reviewScope } else { "pr" }
        reviewCycle = if ($Fields.ContainsKey("reviewCycle")) { $Fields.reviewCycle } elseif ($current) { $current.reviewCycle } else { $null }
        stage = $Stage
        stageStartedAt = if ($current -and $current.stage -eq $Stage -and $current.stageStartedAt) { $current.stageStartedAt } else { (Get-Date).ToUniversalTime().ToString("o") }
        lastHeartbeatAt = (Get-Date).ToUniversalTime().ToString("o")
        lastCompletedStage = if ($Fields.ContainsKey("lastCompletedStage")) { $Fields.lastCompletedStage } elseif ($current) { $current.lastCompletedStage } else { $null }
        lastError = if ($Fields.ContainsKey("lastError")) { Protect-ReviewLoopMessage $Fields.lastError } elseif ($current) { $current.lastError } else { $null }
        automaticPushEnabled = if ($Fields.ContainsKey("automaticPushEnabled")) { [bool]$Fields.automaticPushEnabled } elseif ($current) { [bool]$current.automaticPushEnabled } else { $false }
        nextAction = if ($Fields.ContainsKey("nextAction")) { Protect-ReviewLoopMessage $Fields.nextAction } elseif ($current) { $current.nextAction } else { $null }
        childPid = if ($Fields.ContainsKey("childPid")) { $Fields.childPid } elseif ($current) { $current.childPid } else { $null }
        childCommand = if ($Fields.ContainsKey("childCommand")) { Protect-ReviewLoopMessage $Fields.childCommand } elseif ($current) { $current.childCommand } else { $null }
    }
    if ($Fields.ContainsKey("startedAt")) { $status.startedAt = $Fields.startedAt } elseif ($current -and $current.startedAt) { $status.startedAt = $current.startedAt } else { $status.startedAt = $status.stageStartedAt }
    if (-not $Running) { $status.finishedAt = (Get-Date).ToUniversalTime().ToString("o") }
    $temporary = "$script:ReviewLoopStatusPath.tmp"
    [IO.File]::WriteAllText($temporary, (($status | ConvertTo-Json -Depth 6) + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $script:ReviewLoopStatusPath -Force
}

function New-ReviewLoopLock {
    param([Parameter(Mandatory)][int]$PrNumber)
    Ensure-ReviewLoopStateDirectory
    if (Test-Path -LiteralPath $script:ReviewLoopLockPath) {
        try {
            $existing = Get-Content -LiteralPath $script:ReviewLoopLockPath -Raw -Encoding utf8 | ConvertFrom-Json -ErrorAction Stop
            $alive = $false
            if ($existing.pid) { $alive = $null -ne (Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue) }
            if ($alive) { throw "Review loop is already running with PID $($existing.pid)." }
        } catch {
            if ($_.Exception.Message.StartsWith("Review loop is already running")) { throw }
        }
        Remove-Item -LiteralPath $script:ReviewLoopLockPath -Force
        Write-ReviewLoopLog -Level warn -Stage "starting" -Message "Removed stale review loop lock."
    }
    $lock = @{ pid = $PID; startedAt = (Get-Date).ToUniversalTime().ToString("o"); prNumber = $PrNumber } | ConvertTo-Json -Compress
    $stream = [IO.File]::Open($script:ReviewLoopLockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try { $bytes = [Text.UTF8Encoding]::new($false).GetBytes($lock); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}

function Remove-ReviewLoopLock { Remove-Item -LiteralPath $script:ReviewLoopLockPath -Force -ErrorAction SilentlyContinue }

function Test-ReviewLoopProcessAlive {
    param([AllowNull()][object]$ProcessId)
    if ($null -eq $ProcessId -or [string]::IsNullOrWhiteSpace([string]$ProcessId)) { return $false }
    return $null -ne (Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue)
}
