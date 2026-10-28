param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$announcementRun = Join-Path $env:TEMP ('announcement-api-pg-' + [guid]::NewGuid().ToString('N'))
$announcementListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$announcementListener.Start(); $announcementPort = $announcementListener.LocalEndpoint.Port; $announcementListener.Stop()
New-Item -ItemType Directory -Path $announcementRun | Out-Null
Set-Content -LiteralPath (Join-Path $announcementRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback Announcement verification only. No remote data.'
$announcementData = Join-Path $announcementRun 'data'
$announcementArgs = @('-h','127.0.0.1','-p',"$announcementPort",'-U','postgres','-d','announcementverify','-v','ON_ERROR_STOP=1')
$announcementStarted = $false
function Assert-AnnouncementCluster {
  $actual = & "$PostgresBin/psql.exe" @announcementArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $announcementRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $announcementData).Path) { throw 'Not the owned isolated Announcement cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $announcementData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $announcementRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $announcementStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$announcementData`"",'-l',"`"$(Join-Path $announcementRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $announcementPort`"",'-w','start') -WindowStyle Hidden -PassThru
  $announcementStart.WaitForExit(); if ($announcementStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $announcementStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $announcementPort -U postgres announcementverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $announcementRun -Port $announcementPort -DatabaseName announcementverify
  Assert-AnnouncementCluster
  & "$PostgresBin/psql.exe" @announcementArgs -f (Join-Path $PSScriptRoot 'local-db-announcement-edit.sql') *> (Join-Path $announcementRun 'announcement.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $announcementRun 'announcement.log') -Tail 30; throw 'Announcement SQL verification failed.' }
  $cases = & "$PostgresBin/psql.exe" @announcementArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from announcement_edit_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'Announcement contract export failed.' }
  Set-Content -LiteralPath (Join-Path $announcementRun 'announcement-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS announcement atomic CRUD/pin, CAS, immutable receipts, recipients/delivery rollback, current scope and historical non-replay.'
} finally {
  if ($announcementStarted) {
    Assert-AnnouncementCluster
    & "$PostgresBin/pg_ctl.exe" -D $announcementData -m fast -w stop *> (Join-Path $announcementRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $announcementRun"
}

