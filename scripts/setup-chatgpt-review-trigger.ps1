[CmdletBinding()]
param(
    [string]$CustomGptUrl = $env:CHATGPT_REVIEW_GPT_URL
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CustomGptUrl)) {
    throw "Set CHATGPT_REVIEW_GPT_URL or pass -CustomGptUrl with the custom GPT /g/ URL."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is required." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue) -and -not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is required." }

$gitCandidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe")
)
$git = if (Get-Command git -ErrorAction SilentlyContinue) { (Get-Command git).Source } else { $gitCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $git) { throw "Git is required." }
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
if (-not $repoRoot) { throw "Run this script inside the MeTheory Git repository." }
Set-Location $repoRoot

Write-Host "Installing the isolated Playwright controller dependency."
$npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { (Get-Command npm.cmd).Source } else { (Get-Command npm).Source }
& $npm --prefix (Join-Path $repoRoot "review-trigger") install
if ($LASTEXITCODE -ne 0) { throw "npm install for review-trigger failed." }

$cli = Join-Path $repoRoot "review-trigger\src\cli.js"
Write-Host "A normal Chrome profile will open for login. Sign in to ChatGPT, open the custom GPT, then close that browser window before starting the watcher."
& node $cli setup --custom-gpt-url $CustomGptUrl
if ($LASTEXITCODE -ne 0) { throw "ChatGPT browser profile setup failed." }

Write-Host "ChatGPT review trigger setup completed."
