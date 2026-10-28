param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$danceRun = Join-Path $env:TEMP ('dance-api-pg-' + [guid]::NewGuid().ToString('N'))
$danceListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$danceListener.Start(); $dancePort = $danceListener.LocalEndpoint.Port; $danceListener.Stop()
New-Item -ItemType Directory -Path $danceRun | Out-Null
Set-Content -LiteralPath (Join-Path $danceRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback Dance verification only. No remote data.'
$danceData = Join-Path $danceRun 'data'
$danceArgs = @('-h','127.0.0.1','-p',"$dancePort",'-U','postgres','-d','danceverify','-v','ON_ERROR_STOP=1')
$danceStarted = $false
function Assert-DanceCluster {
  $actual = & "$PostgresBin/psql.exe" @danceArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $danceRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $danceData).Path) { throw 'Not the owned isolated Dance cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $danceData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $danceRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $danceStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$danceData`"",'-l',"`"$(Join-Path $danceRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $dancePort`"",'-w','start') -WindowStyle Hidden -PassThru
  $danceStart.WaitForExit(); if ($danceStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $danceStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $dancePort -U postgres danceverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $danceRun -Port $dancePort -DatabaseName danceverify
  Assert-DanceCluster
  & "$PostgresBin/psql.exe" @danceArgs -f (Join-Path $PSScriptRoot 'local-db-dance.sql') *> (Join-Path $danceRun 'dance.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $danceRun 'dance.log') -Tail 30; throw 'Dance SQL verification failed.' }
  $cases = & "$PostgresBin/psql.exe" @danceArgs -Atc "select jsonb_agg(jsonb_build_object('name',name,'kind',kind,'payload',payload) order by name) from dance_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'Dance contract export failed.' }
  Set-Content -LiteralPath (Join-Path $danceRun 'dance-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS full Dance fields, frozen library, exact retries, merge/conflict, permissions, links, tenant and revoked access.'
} finally {
  if ($danceStarted) {
    Assert-DanceCluster
    & "$PostgresBin/pg_ctl.exe" -D $danceData -m fast -w stop *> (Join-Path $danceRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $danceRun"
}
