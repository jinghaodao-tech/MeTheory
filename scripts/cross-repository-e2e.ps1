$ErrorActionPreference = "Stop"

$root = Join-Path $env:TEMP "pcs-cross-e2e"
if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $root "notes") | Out-Null
$database = Join-Path $root "context.sqlite3"
$stdout = Join-Path $root "pcs.stdout.log"
$stderr = Join-Path $root "pcs.stderr.log"
$command = "`$env:PCS_PORT='18901'; `$env:PCS_DB='$database'; `$env:PCS_NOTES_DIR='{0}'; Set-Location 'C:\Users\jingh\Personal-Context-Studio'; npm.cmd run dev" -f (Join-Path $root "notes")
$process = Start-Process -FilePath powershell.exe -ArgumentList @("-NoProfile", "-Command", $command) -WorkingDirectory "C:\Users\jingh\Personal-Context-Studio" -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

try {
  $healthy = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      if ((Invoke-RestMethod "http://127.0.0.1:18901/health").ok) { $healthy = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $healthy) { throw "PCS did not become ready" }

  function Post([string]$path, [hashtable]$value, [hashtable]$headers = @{}) {
    try {
      return Invoke-RestMethod -Uri ("http://127.0.0.1:18901" + $path) -Method Post -ContentType "application/json" -Headers $headers -Body ($value | ConvertTo-Json -Depth 12)
    } catch {
      throw "PCS POST $path failed: $($_.Exception.Message)"
    }
  }

  $template = Post "/v1/context-templates" @{ name = "Cross repository"; purpose = "self_understanding"; fields = @(
      @{ fieldKey = "task_clarity"; label = "Task clarity"; valueType = "number"; required = $true; displayOrder = 1; minimum = 1; maximum = 5; analysisRole = "task_clarity"; analysisRoleConfirmed = $true; analysisUsage = "condition"; analysisMergeAllowed = $true; sharingDefault = "purpose_only"; sensitivity = "normal"; reason = "condition" },
      @{ fieldKey = "start_delay"; label = "Start delay"; valueType = "number"; required = $true; displayOrder = 2; minimum = 0; maximum = 60; analysisRole = "start_delay"; analysisRoleConfirmed = $true; analysisUsage = "outcome"; analysisMergeAllowed = $true; sharingDefault = "purpose_only"; sensitivity = "normal"; reason = "outcome" }
    ) }
  $templateId = $template.item.id
  Post ("/v1/context-templates/{0}/activate" -f $templateId) @{} | Out-Null
  $purpose = Post "/v1/sharing-purposes" @{ name = "me_theory_analysis" }
  $purposeId = $purpose.id

  $entryIds = @()
  for ($index = 0; $index -lt 8; $index++) {
    $entry = Post "/v1/context-entries" @{ templateId = $templateId; values = @{ task_clarity = $(if ($index -lt 4) { 2 } else { 4 }); start_delay = $(if ($index -lt 4) { 40 } else { 10 }) } }
    $entryIds += $entry.id
    Invoke-RestMethod -Uri ("http://127.0.0.1:18901/v1/context-entries/{0}/values/task_clarity/purposes" -f $entry.id) -Method Put -ContentType "application/json" -Body (@{ purposeIds = @($purposeId) } | ConvertTo-Json) | Out-Null
    Invoke-RestMethod -Uri ("http://127.0.0.1:18901/v1/context-entries/{0}/values/start_delay/purposes" -f $entry.id) -Method Put -ContentType "application/json" -Body (@{ purposeIds = @($purposeId) } | ConvertTo-Json) | Out-Null
  }

  $profileResponse = Post "/v1/context-profiles" @{ name = "MeTheory profile"; target = "metheory"; purposeId = $purposeId; includedFields = @(@{ templateId = $templateId; fieldKey = "task_clarity" }, @{ templateId = $templateId; fieldKey = "start_delay" }) }
  $profileId = $profileResponse.id
  if (-not $profileId) { throw "PCS profile response did not contain an id" }
  $clientResponse = Post "/v1/integration-clients" @{ name = "MeTheory e2e"; permissions = @("read_snapshot"); allowedProfileIds = @($profileId) }
  if (-not $clientResponse.id -or -not $clientResponse.token) { throw "PCS client response did not contain credentials" }

  $env:PCS_API_URL = "http://127.0.0.1:18901"
  $env:PCS_CLIENT_ID = $clientResponse.id
  $env:PCS_CLIENT_TOKEN = $clientResponse.token
  $env:PCS_PROFILE_ID = $profileId
  $probeQuery = "?profileId=$([uri]::EscapeDataString($profileId))&from=2026-01-01T00:00:00.000Z&to=2030-01-01T00:00:00.000Z&timezone=Asia%2FTokyo"
  $probe = Invoke-RestMethod -Uri ("http://127.0.0.1:18901/v1/context/analysis-snapshot" + $probeQuery) -Headers @{ "x-pcs-client-id" = $clientResponse.id; Authorization = "Bearer $($clientResponse.token)" }
  if (-not $probe.contractRevision) { throw "PCS snapshot probe did not return a contract revision" }
  & node --experimental-strip-types --input-type=module -e "import { PcsIntegrationClient } from './apps/api/src/personalContextClient.ts'; import { assertValidPcsAnalysisSnapshotV2 } from './packages/contracts/src/pcsAnalysisSnapshotV2.ts'; import { analyzePcsAnalysisSnapshot } from './packages/self-understanding/src/pcsSnapshotAnalysis.ts'; try { const snapshot=assertValidPcsAnalysisSnapshotV2(await new PcsIntegrationClient().getAnalysisSnapshot({profileId:process.env.PCS_PROFILE_ID,from:'2026-01-01T00:00:00.000Z',to:'2030-01-01T00:00:00.000Z',timezone:'Asia/Tokyo'})); const result=analyzePcsAnalysisSnapshot(snapshot,{minimumTotalSamples:8}); if(snapshot.contractRevision !== 'pcs-analysis-snapshot-v2.1') throw new Error('revision mismatch'); if(snapshot.records.length !== 8) throw new Error('record count mismatch'); console.log(JSON.stringify({ok:true,revision:snapshot.contractRevision,records:snapshot.records.length,status:result.status,candidates:result.hypotheses.length})); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }"
  if ($LASTEXITCODE -ne 0) { throw "MeTheory cross-repository verification failed" }
} finally {
  if ($process -and -not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
  Remove-Item Env:PCS_API_URL,Env:PCS_CLIENT_ID,Env:PCS_CLIENT_TOKEN,Env:PCS_PROFILE_ID -ErrorAction SilentlyContinue
}
