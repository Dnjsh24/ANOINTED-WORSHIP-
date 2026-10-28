param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$profileRun = Join-Path $env:TEMP ('profile-api-pg-' + [guid]::NewGuid().ToString('N'))
$profileListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$profileListener.Start(); $profilePort = $profileListener.LocalEndpoint.Port; $profileListener.Stop()
New-Item -ItemType Directory -Path $profileRun | Out-Null
Set-Content -LiteralPath (Join-Path $profileRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback Profile verification only. No remote data.'
$profileData = Join-Path $profileRun 'data'
$profileArgs = @('-h','127.0.0.1','-p',"$profilePort",'-U','postgres','-d','profileverify','-v','ON_ERROR_STOP=1')
$profileStarted = $false
function Assert-ProfileCluster {
  $actual = & "$PostgresBin/psql.exe" @profileArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $profileRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $profileData).Path) { throw 'Not the owned isolated Profile cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $profileData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $profileRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $profileStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$profileData`"",'-l',"`"$(Join-Path $profileRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $profilePort`"",'-w','start') -WindowStyle Hidden -PassThru
  $profileStart.WaitForExit(); if ($profileStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $profileStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $profilePort -U postgres profileverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $profileRun -Port $profilePort -DatabaseName profileverify
  Assert-ProfileCluster
  & "$PostgresBin/psql.exe" @profileArgs -f (Join-Path $PSScriptRoot 'local-db-profile-edit.sql') *> (Join-Path $profileRun 'profile.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $profileRun 'profile.log') -Tail 30; throw 'Profile SQL verification failed.' }
  $cases = & "$PostgresBin/psql.exe" @profileArgs -Atc "select jsonb_agg(jsonb_build_object('identity',identity,'request',request,'receipt',receipt) order by name) from profile_edit_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'Profile contract export failed.' }
  Set-Content -LiteralPath (Join-Path $profileRun 'profile-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS own profile atomic CAS, immutable receipts, rollback, own scope, revoked access and explicit-deny boundaries.'
} finally {
  if ($profileStarted) {
    Assert-ProfileCluster
    & "$PostgresBin/pg_ctl.exe" -D $profileData -m fast -w stop *> (Join-Path $profileRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $profileRun"
}
