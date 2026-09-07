$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testConfig=Join-Path $root '.data/deploy-smoke.json'
New-Item -ItemType Directory -Force -Path (Join-Path $root '.data') | Out-Null
@{project='steadier-test-project';region='australia-southeast1';ownerUid='test-owner';webOrigin='https://example.github.io';webAppUrl='https://example.github.io/steadier/';googleClientId='test-client.apps.googleusercontent.com';vapidPublicKey='test-public-vapid';vapidSubject='mailto:owner@example.com';newsStorageRightsConfirmed=$false} | ConvertTo-Json | Set-Content -LiteralPath $testConfig -Encoding UTF8
$global:SteadierDeployCommands=New-Object Collections.Generic.List[string]
function global:gcloud {
  $line=$args -join ' '
  $global:SteadierDeployCommands.Add($line)
  $global:LASTEXITCODE=0
  if($line -match 'run services describe steadier-worker'){return 'https://test-worker.run.app'}
  if($line -match 'run services describe steadier-api'){return 'https://test-api.run.app'}
}
try {
  & (Join-Path $root 'infra/deploy.ps1') -ConfigFile $testConfig
  $commands=$global:SteadierDeployCommands -join "`n"
  foreach($expected in @('run deploy steadier-worker','run deploy steadier-api','--no-allow-unauthenticated','--allow-unauthenticated','--role=roles/firebaseauth.viewer','--cors-file=','--soft-delete-duration=0','scheduler jobs update http steadier-maintenance','--oidc-token-audience=https://test-worker.run.app')){if(-not $commands.Contains($expected)){throw "Missing expected deployment operation: $expected"}}
  $runtime=Get-Content -LiteralPath (Join-Path $root '.data/deploy/runtime.yaml') -Raw
  if(-not $runtime.Contains('https://test-api.run.app/api/google/callback')){throw 'Final OAuth callback was not applied.'}
  Write-Host "Deployment smoke test passed with $($global:SteadierDeployCommands.Count) simulated gcloud commands. No cloud resources were contacted."
} finally { Remove-Item Function:\gcloud; Remove-Item -LiteralPath $testConfig }
