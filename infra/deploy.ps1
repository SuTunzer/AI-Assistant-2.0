param([string]$ConfigFile = "$PSScriptRoot/cloud.config.json")
$ErrorActionPreference = 'Stop'
$cfg = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
foreach ($name in @('project','region','ownerUid','webOrigin','webAppUrl','googleClientId','vapidPublicKey','vapidSubject')) {
  if (-not $cfg.$name -or $cfg.$name -match 'your-|YOUR-|public-key-from') { throw "Fill '$name' in cloud.config.json first." }
}
if ($cfg.project -notmatch '^[a-z][a-z0-9-]{4,61}[a-z0-9]$') { throw 'Invalid project ID.' }
if (([uri]$cfg.webOrigin).Scheme -ne 'https' -or ([uri]$cfg.webAppUrl).GetLeftPart('Authority') -ne $cfg.webOrigin) { throw 'The app URL must use the configured HTTPS web origin.' }
function Invoke-Gcloud {
  param([string[]]$Arguments)
  & gcloud @Arguments --project=$($cfg.project) --quiet
  if ($LASTEXITCODE -ne 0) { throw "gcloud failed: $($Arguments[0..([Math]::Min(2,$Arguments.Length-1))] -join ' ')" }
}
function Exists-Gcloud {
  param([string[]]$Arguments)
  & gcloud @Arguments --project=$($cfg.project) --quiet 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}
$region=$cfg.region
$runtime="steadier-runtime@$($cfg.project).iam.gserviceaccount.com"
$invoker="steadier-jobs@$($cfg.project).iam.gserviceaccount.com"
$image="$region-docker.pkg.dev/$($cfg.project)/steadier/app:latest"
Invoke-Gcloud @('services','enable','run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','firestore.googleapis.com','storage.googleapis.com','cloudtasks.googleapis.com','cloudscheduler.googleapis.com','secretmanager.googleapis.com','iamcredentials.googleapis.com','texttospeech.googleapis.com','aiplatform.googleapis.com')
foreach ($name in @('steadier-runtime','steadier-jobs')) {
  if (-not (Exists-Gcloud @('iam','service-accounts','describe',"$name@$($cfg.project).iam.gserviceaccount.com"))) { Invoke-Gcloud @('iam','service-accounts','create',$name) }
}
foreach ($role in @('roles/datastore.user','roles/cloudtasks.enqueuer','roles/firebaseauth.viewer','roles/serviceusage.serviceUsageConsumer','roles/aiplatform.user')) { Invoke-Gcloud @('projects','add-iam-policy-binding',$cfg.project,"--member=serviceAccount:$runtime","--role=$role") }
Invoke-Gcloud @('iam','service-accounts','add-iam-policy-binding',$invoker,"--member=serviceAccount:$runtime",'--role=roles/iam.serviceAccountUser')
Invoke-Gcloud @('iam','service-accounts','add-iam-policy-binding',$runtime,"--member=serviceAccount:$runtime",'--role=roles/iam.serviceAccountTokenCreator')
if (-not (Exists-Gcloud @('firestore','databases','describe','--database=(default)'))) { Invoke-Gcloud @('firestore','databases','create','--database=(default)',"--location=$region",'--type=firestore-native') }
if (-not (Exists-Gcloud @('artifacts','repositories','describe','steadier',"--location=$region"))) { Invoke-Gcloud @('artifacts','repositories','create','steadier','--repository-format=docker',"--location=$region") }
$generated=Join-Path $PSScriptRoot '../.data/deploy'
New-Item -ItemType Directory -Force -Path $generated | Out-Null
foreach ($kind in @('audio','temp','backup')) {
  $bucket="gs://$($cfg.project)-steadier-$kind"
  if (-not (Exists-Gcloud @('storage','buckets','describe',$bucket))) { Invoke-Gcloud @('storage','buckets','create',$bucket,"--location=$region",'--uniform-bucket-level-access','--public-access-prevention') }
  Invoke-Gcloud @('storage','buckets','update',$bucket,'--soft-delete-duration=0')
  Invoke-Gcloud @('storage','buckets','add-iam-policy-binding',$bucket,"--member=serviceAccount:$runtime",'--role=roles/storage.objectAdmin')
  if ($kind -eq 'audio') { $corsFile=Join-Path $generated 'audio-cors.json';ConvertTo-Json -Depth 8 -InputObject @(@{origin=@($cfg.webOrigin);method=@('GET','HEAD');responseHeader=@('Content-Type','Content-Length','ETag');maxAgeSeconds=3600}) | Set-Content -LiteralPath $corsFile -Encoding UTF8;Invoke-Gcloud @('storage','buckets','update',$bucket,"--cors-file=$corsFile") }
  if ($kind -ne 'audio') { $days=if($kind -eq 'temp'){1}else{7};$lifecycle=Join-Path $generated "$kind-lifecycle.json"; @{rule=@(@{action=@{type='Delete'};condition=@{age=$days}})} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $lifecycle -Encoding UTF8;Invoke-Gcloud @('storage','buckets','update',$bucket,"--lifecycle-file=$lifecycle") }
}
foreach ($key in @('anthropic-api-key','gemini-api-key','openai-api-key','brave-api-key')) {
  $secret="steadier-$key"
  if (-not (Exists-Gcloud @('secrets','describe',$secret))) { Invoke-Gcloud @('secrets','create',$secret,'--replication-policy=automatic') }
  foreach ($role in @('roles/secretmanager.secretAccessor','roles/secretmanager.secretVersionAdder')) { Invoke-Gcloud @('secrets','add-iam-policy-binding',$secret,"--member=serviceAccount:$runtime","--role=$role") }
}
foreach ($secret in @('steadier-encryption-key','steadier-google-client-secret','steadier-vapid-private-key')) {
  if (-not (Exists-Gcloud @('secrets','versions','describe','latest',"--secret=$secret"))) { throw "Upload $secret to Secret Manager first; see docs/SETUP.md." }
  Invoke-Gcloud @('secrets','add-iam-policy-binding',$secret,"--member=serviceAccount:$runtime",'--role=roles/secretmanager.secretAccessor')
}
if (-not (Exists-Gcloud @('tasks','queues','describe','steadier-jobs',"--location=$region"))) { Invoke-Gcloud @('tasks','queues','create','steadier-jobs',"--location=$region") }
Invoke-Gcloud @('tasks','queues','update','steadier-jobs',"--location=$region",'--max-concurrent-dispatches=2','--max-dispatches-per-second=2','--max-attempts=5','--min-backoff=10s','--max-backoff=300s')
Push-Location (Join-Path $PSScriptRoot '..')
try { Invoke-Gcloud @('builds','submit','--tag',$image,'.') } finally { Pop-Location }
$workerUrl='https://initial-configuration.invalid'
$apiUrl=''
function Write-RuntimeConfig {
  $envs=@{APP_MODE='cloud';GOOGLE_CLOUD_PROJECT=$cfg.project;GOOGLE_CLOUD_REGION=$region;OWNER_UID=$cfg.ownerUid;WEB_ORIGIN=$cfg.webOrigin;WEB_APP_URL=$cfg.webAppUrl;WORKER_URL=$workerUrl;WORKER_SERVICE_ACCOUNT=$invoker;QUEUE_NAME='steadier-jobs';STORAGE_BUCKET="$($cfg.project)-steadier-audio";TEMP_BUCKET="$($cfg.project)-steadier-temp";BACKUP_BUCKET="$($cfg.project)-steadier-backup";GOOGLE_CLIENT_ID=$cfg.googleClientId;GOOGLE_REDIRECT_URI=if($apiUrl){"$apiUrl/api/google/callback"}else{'https://initial-configuration.invalid/api/google/callback'};VAPID_PUBLIC_KEY=$cfg.vapidPublicKey;VAPID_SUBJECT=$cfg.vapidSubject;NEWS_STORAGE_RIGHTS_CONFIRMED=([string][bool]$cfg.newsStorageRightsConfirmed).ToLower()}
  $lines=$envs.GetEnumerator() | ForEach-Object { $_.Key + ': ' + (ConvertTo-Json -InputObject ([string]$_.Value) -Compress) }
  $lines | Set-Content -LiteralPath (Join-Path $generated 'runtime.yaml') -Encoding UTF8
}
function Deploy-Service {
  param([string]$Name,[string]$Public)
  Write-RuntimeConfig
  $deploy=@('run','deploy',$Name,"--image=$image","--region=$region","--service-account=$runtime",'--port=8080','--memory=1Gi','--cpu=1','--min-instances=0','--max-instances=2','--concurrency=4','--timeout=900',"--env-vars-file=$(Join-Path $generated 'runtime.yaml')",'--set-secrets=ENCRYPTION_KEY=steadier-encryption-key:latest,GOOGLE_CLIENT_SECRET=steadier-google-client-secret:latest,VAPID_PRIVATE_KEY=steadier-vapid-private-key:latest',$Public)
  Invoke-Gcloud $deploy
}
Deploy-Service 'steadier-worker' '--no-allow-unauthenticated'
$workerUrl=(& gcloud run services describe steadier-worker --format='value(status.url)' --region=$region --project=$($cfg.project)).Trim()
Deploy-Service 'steadier-api' '--allow-unauthenticated'
$apiUrl=(& gcloud run services describe steadier-api --format='value(status.url)' --region=$region --project=$($cfg.project)).Trim()
Deploy-Service 'steadier-worker' '--no-allow-unauthenticated'
Deploy-Service 'steadier-api' '--allow-unauthenticated'
Invoke-Gcloud @('run','services','add-iam-policy-binding','steadier-worker',"--region=$region","--member=serviceAccount:$invoker",'--role=roles/run.invoker')
$schedule=@('scheduler','jobs')
if (Exists-Gcloud @('scheduler','jobs','describe','steadier-maintenance',"--location=$region")) { $schedule+='update' } else { $schedule+='create' }
$schedule+=@('http','steadier-maintenance',"--location=$region",'--schedule=*/5 * * * *',"--uri=$workerUrl/internal/maintenance",'--http-method=POST',"--oidc-service-account-email=$invoker","--oidc-token-audience=$workerUrl",'--attempt-deadline=300s')
Invoke-Gcloud $schedule
Write-Host "API URL for GitHub variable VITE_API_URL: $apiUrl/api"
Write-Host "Add this exact redirect URI to the Google Tasks OAuth client: $apiUrl/api/google/callback"
Write-Host 'Publish the deny-all Firestore rules, configure Firebase Authentication, then deploy Pages. See docs/SETUP.md.'
