$ErrorActionPreference = "Stop"

$root = Join-Path $env:TEMP "metheory-closed-loop-e2e"
if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $root "notes") | Out-Null
$pcsDb = Join-Path $root "pcs.sqlite3"
$metheoryDb = Join-Path $root "metheory.sqlite3"
$pcsOut = Join-Path $root "pcs.out.log"
$pcsErr = Join-Path $root "pcs.err.log"
$mtOut = Join-Path $root "metheory.out.log"
$mtErr = Join-Path $root "metheory.err.log"

function Start-LocalApi([string]$repo, [string]$command, [string]$stdout, [string]$stderr) {
  $savedPath = $env:PATH
  $env:PATH = $null
  try { return Start-Process -FilePath powershell.exe -ArgumentList @("-NoProfile", "-Command", $command) -WorkingDirectory $repo -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru }
  finally { $env:PATH = $savedPath }
}
function Wait-Health([string]$url, [int]$seconds = 30) {
  for ($attempt = 0; $attempt -lt ($seconds * 4); $attempt++) {
    try { if ((Invoke-RestMethod $url -TimeoutSec 2).ok) { return } } catch { Start-Sleep -Milliseconds 250 }
  }
  throw "API did not become ready: $url"
}
function Wait-Port([int]$port, [int]$seconds = 30) {
  for ($attempt = 0; $attempt -lt ($seconds * 4); $attempt++) {
    try {
      $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
      if ($connection) { return }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  throw "API did not open port: $port"
}
function Json-Post([string]$base, [string]$path, [hashtable]$value, [hashtable]$headers = @{}) {
  return Invoke-RestMethod -Uri ($base + $path) -Method Post -ContentType "application/json" -Headers $headers -Body ($value | ConvertTo-Json -Depth 20) -TimeoutSec 10
}
function Json-Get([string]$base, [string]$path, [hashtable]$headers = @{}) {
  return Invoke-RestMethod -Uri ($base + $path) -Method Get -Headers $headers -TimeoutSec 10
}

$pcs = $null
$metheory = $null
try {
  $pcsCommand = "`$env:PATH='C:\Program Files\nodejs'; `$env:PCS_PORT='18911'; `$env:PCS_DB='$pcsDb'; `$env:PCS_NOTES_DIR='{0}'; Set-Location 'C:\Users\jingh\Personal-Context-Studio'; & 'C:\Program Files\nodejs\npm.cmd' run dev" -f (Join-Path $root "notes")
  $pcs = Start-LocalApi "C:\Users\jingh\Personal-Context-Studio" $pcsCommand $pcsOut $pcsErr
  Wait-Health "http://127.0.0.1:18911/health"
  $pcsBase = "http://127.0.0.1:18911"
  Write-Output "PCS ready"

  $template = Json-Post $pcsBase "/v1/context-templates" @{ name = "Closed loop"; purpose = "self_understanding"; fields = @(
    @{ fieldKey = "task_clarity"; label = "Task clarity"; valueType = "number"; required = $true; displayOrder = 1; minimum = 1; maximum = 5; analysisRole = "task_clarity"; analysisRoleConfirmed = $true; analysisUsage = "condition"; analysisMergeAllowed = $true; sharingDefault = "purpose_only"; sensitivity = "normal"; reason = "condition" },
    @{ fieldKey = "start_delay"; label = "Start delay"; valueType = "duration_minutes"; required = $true; displayOrder = 2; minimum = 0; maximum = 60; analysisRole = "start_delay"; analysisRoleConfirmed = $true; analysisUsage = "outcome"; analysisMergeAllowed = $true; sharingDefault = "purpose_only"; sensitivity = "normal"; reason = "outcome" }
  ) }
  $templateId = $template.item.id
  Json-Post $pcsBase "/v1/context-templates/$templateId/activate" @{} | Out-Null
  $purposeId = (Json-Post $pcsBase "/v1/sharing-purposes" @{ name = "closed_loop" }).id
  for ($index = 0; $index -lt 12; $index++) {
    $entry = Json-Post $pcsBase "/v1/context-entries" @{ templateId = $templateId; values = @{ task_clarity = $(if ($index -lt 6) { 2 } else { 4 }); start_delay = $(if ($index -lt 6) { 40 } else { 10 }) } }
    foreach ($field in @("task_clarity", "start_delay")) { Invoke-RestMethod -Uri "$pcsBase/v1/context-entries/$($entry.id)/values/$field/purposes" -Method Put -ContentType "application/json" -Body (@{ purposeIds = @($purposeId) } | ConvertTo-Json) | Out-Null }
  }
  $profile = Json-Post $pcsBase "/v1/context-profiles" @{ name = "Closed loop profile"; target = "metheory"; purposeId = $purposeId; includedFields = @(@{ templateId = $templateId; fieldKey = "task_clarity" }, @{ templateId = $templateId; fieldKey = "start_delay" }) }
  $client = Json-Post $pcsBase "/v1/integration-clients" @{ name = "MeTheory closed loop"; permissions = @("read_snapshot"); allowedProfileIds = @($profile.id) }
  $headers = @{ "x-pcs-client-id" = $client.id; Authorization = "Bearer $($client.token)" }
  $snapshot = Json-Get $pcsBase "/v1/context/analysis-snapshot?profileId=$([uri]::EscapeDataString($profile.id))&from=2026-07-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z&timezone=Asia%2FTokyo" $headers
  if ($snapshot.contractRevision -ne "pcs-analysis-snapshot-v2.1" -or $snapshot.records.Count -ne 12) { throw "PCS snapshot contract or record count invalid" }
  Write-Output "PCS snapshot ready"

  $env:METHEORY_DB = $metheoryDb
  $env:PCS_API_URL = "http://127.0.0.1:18911"
  $env:PCS_CLIENT_ID = $client.id
  $env:PCS_CLIENT_TOKEN = $client.token
  $env:PCS_PROFILE_ID = $profile.id
  $mtCommand = "`$env:PATH='C:\Program Files\nodejs'; `$env:PORT='18912'; `$env:METHEORY_DB='$metheoryDb'; `$env:PCS_API_URL='http://127.0.0.1:18911'; `$env:PCS_CLIENT_ID='$($client.id)'; `$env:PCS_CLIENT_TOKEN='$($client.token)'; `$env:PCS_PROFILE_ID='$($profile.id)'; Set-Location 'C:\Users\jingh\MeTheory'; & 'C:\Program Files\nodejs\npm.cmd' run dev:api"
  $metheory = Start-LocalApi "C:\Users\jingh\MeTheory" $mtCommand $mtOut $mtErr
  Wait-Port 18912
  $mtBase = "http://127.0.0.1:18912"
  Write-Output "MeTheory ready"
  & node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.env.METHEORY_DB); db.prepare('INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)').run('e2e-user','e2e-subject','ja-JP','Asia/Tokyo','2026-07-01T00:00:00.000Z'); db.close();"
  if ($LASTEXITCODE -ne 0) { throw "Could not create MeTheory test user" }

  $binding = Json-Post $mtBase "/v1/pcs/profile-binding" @{ userId = "e2e-user"; profileId = $profile.id }
  if ($binding.binding.pcsProfileId -ne $profile.id) { throw "Profile binding failed" }
  $analysisBody = @{ userId = "e2e-user"; profileId = $profile.id; startAt = "2026-07-01T00:00:00.000Z"; endAt = "2026-08-01T00:00:00.000Z"; minimumEntryCount = 8 }
  $analysis = Json-Post $mtBase "/v1/self-understanding/analyze-personal-context" $analysisBody
  $analysisAgain = Json-Post $mtBase "/v1/self-understanding/analyze-personal-context" $analysisBody
  if (-not $analysis.analysisRunId -or $analysis.analysisRunId -ne $analysisAgain.analysisRunId) { throw "Analysis run was not idempotent" }
  if ($analysis.hypotheses.Count -lt 1) { throw "No candidate was generated" }
  Write-Output "Analysis ready"
  $candidateId = $analysis.hypotheses[0].id
  Write-Output "Candidate selected: $candidateId"
  $review = Json-Post $mtBase "/v1/self-understanding/reviews" @{ userId = "e2e-user"; candidateId = $candidateId; rating = "fits"; note = "E2E review" }
  if (-not $review.selfModelCandidateId) { throw "Candidate review did not create Self Model proposal" }
  $draft = Json-Post $mtBase "/v1/self-understanding/$([uri]::EscapeDataString($candidateId))/experiment-draft" @{ userId = "e2e-user"; durationDays = 7; minimumObservations = 8; timezone = "Asia/Tokyo" }
  $groupA = $draft.draft.groupAKey
  $groupB = $draft.draft.groupBKey
  if (-not $groupA -or -not $groupB) { throw "Experiment draft did not contain comparison groups" }
  $experiment = (Json-Post $mtBase "/v1/experiment-drafts/$($draft.draft.id)/accept" @{ userId = "e2e-user" }).experiment
  Json-Post $mtBase "/v1/experiments/$($experiment.id)/start" @{ userId = "e2e-user" } | Out-Null
  for ($index = 0; $index -lt 4; $index++) {
    Json-Post $mtBase "/v1/experiments/$($experiment.id)/responses" @{ userId = "e2e-user"; idempotencyKey = "e2e-group-a-$index"; groupKey = $groupA; outcome = 1; source = "checkin" } | Out-Null
    Json-Post $mtBase "/v1/experiments/$($experiment.id)/responses" @{ userId = "e2e-user"; idempotencyKey = "e2e-group-b-$index"; groupKey = $groupB; outcome = 0; source = "checkin" } | Out-Null
  }
  Json-Post $mtBase "/v1/experiments/$($experiment.id)/complete" @{ userId = "e2e-user" } | Out-Null
  $evaluation = (Json-Post $mtBase "/v1/experiments/$($experiment.id)/evaluate" @{ userId = "e2e-user" }).evaluation
  if ($evaluation.status -notin @("supported", "challenged", "mixed", "inconclusive")) { throw "Unexpected deterministic evaluation status" }
  Json-Post $mtBase "/v1/self-understanding/self-model-candidates/review" @{ userId = "e2e-user"; candidateId = $review.selfModelCandidateId; status = "accepted" } | Out-Null
  Write-Output "Experiment and Self Model flow ready"
  $mismatchBody = @{ userId = "e2e-user"; profileId = "different-profile"; startAt = $analysisBody.startAt; endAt = $analysisBody.endAt; minimumEntryCount = 8 }
  $mismatchFailed = $false
  try { Json-Post $mtBase "/v1/self-understanding/analyze-personal-context" $mismatchBody | Out-Null } catch { $mismatchFailed = $true }
  if (-not $mismatchFailed) { throw "Expected profile mismatch request to fail" }
} catch {
  throw
} finally {
  if ($metheory -and -not $metheory.HasExited) { & taskkill.exe /PID $metheory.Id /T /F | Out-Null }
  if ($pcs -and -not $pcs.HasExited) { & taskkill.exe /PID $pcs.Id /T /F | Out-Null }
  Remove-Item Env:METHEORY_DB -ErrorAction SilentlyContinue
  Remove-Item Env:PCS_API_URL,Env:PCS_CLIENT_ID,Env:PCS_CLIENT_TOKEN,Env:PCS_PROFILE_ID -ErrorAction SilentlyContinue
}

Write-Output '{"ok":true,"flow":"pcs-analysis-review-experiment-evaluation-self-model"}'
