[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ExpectedHeadSha,
    [Parameter(Mandatory)][ValidateRange(1, 2147483647)][int]$PrNumber,
    [string]$CommitMessage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$gitCandidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
)
$git = if (Get-Command git -ErrorAction SilentlyContinue) { (Get-Command git).Source } else { $gitCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $git) { throw "Git is required." }

$branch = (& $git branch --show-current 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) { throw "A checked-out working branch is required." }
if ($branch -in @("main", "master")) { throw "Automatic commit and push are disabled on main/master." }

$headSha = (& $git rev-parse HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $headSha -ne $ExpectedHeadSha) { throw "Working HEAD does not match the reviewed PR SHA." }

$stagedChanges = & $git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw "The index already contains changes; refusing to commit files not produced by this review run." }

& $git add -A
if ($LASTEXITCODE -ne 0) { throw "Could not stage the verified review changes." }
& $git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    [pscustomobject]@{ committed = $false; branch = $branch; headSha = $headSha } | ConvertTo-Json -Compress
    exit 0
}
if ($LASTEXITCODE -ne 1) { throw "Could not inspect staged review changes." }

if ([string]::IsNullOrWhiteSpace($CommitMessage)) { $CommitMessage = "Apply Codex review fixes for PR #$PrNumber" }
& $git commit -m $CommitMessage | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not commit the verified review changes." }

$newHeadSha = (& $git rev-parse HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $newHeadSha -eq $headSha) { throw "Commit did not create a new HEAD SHA." }
& $git push origin $branch | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not push the verified review commit." }

[pscustomobject]@{ committed = $true; branch = $branch; headSha = $newHeadSha } | ConvertTo-Json -Compress
