param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$rehearsalRun = Join-Path $env:TEMP ('mobile-rehearsal-pg-' + [guid]::NewGuid().ToString('N'))
$rehearsalListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$rehearsalListener.Start(); $rehearsalPort = $rehearsalListener.LocalEndpoint.Port; $rehearsalListener.Stop()
New-Item -ItemType Directory -Path $rehearsalRun | Out-Null
Set-Content -LiteralPath (Join-Path $rehearsalRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable local rehearsal verification. No remote data.'
$rehearsalData = Join-Path $rehearsalRun 'data'
$rehearsalRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$rehearsalArgs = @('-h','127.0.0.1','-p',"$rehearsalPort",'-U','postgres','-d','rehearsalverify','-v','ON_ERROR_STOP=1')
$rehearsalStarted = $false
function Assert-RehearsalCluster {
  $actual = & "$PostgresBin/psql.exe" @rehearsalArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $rehearsalRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $rehearsalData).Path) { throw 'Not the owned isolated rehearsal cluster.' }
}
function Invoke-RehearsalSql([string]$File,[string]$Log) {
  Assert-RehearsalCluster
  & "$PostgresBin/psql.exe" @rehearsalArgs -f $File *> (Join-Path $rehearsalRun $Log)
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $rehearsalRun $Log) -Tail 30; throw "SQL verification failed: $Log" }
}
try {
  & "$PostgresBin/initdb.exe" -D $rehearsalData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $rehearsalRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $rehearsalStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$rehearsalData`"",'-l',"`"$(Join-Path $rehearsalRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $rehearsalPort`"",'-w','start') -WindowStyle Hidden -PassThru
  $rehearsalStart.WaitForExit(); if ($rehearsalStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $rehearsalStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $rehearsalPort -U postgres rehearsalverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  Invoke-RehearsalSql (Join-Path $PSScriptRoot 'local-db-bootstrap.sql') 'bootstrap.log'
  $rehearsalMigrations = Get-ChildItem (Join-Path $rehearsalRoot 'supabase/migrations/*.sql') | Sort-Object Name
  foreach ($migration in $rehearsalMigrations) {
    $sql = (Get-Content -Raw -LiteralPath $migration.FullName) -replace '(?im)^create extension if not exists pg_net with schema extensions;','-- Disposable no-network pg_net stub.'
    $copy = Join-Path $rehearsalRun $migration.Name
    Set-Content -LiteralPath $copy -Value $sql -Encoding utf8
    Invoke-RehearsalSql $copy ($migration.Name + '.log')
  }
  Invoke-RehearsalSql (Join-Path $PSScriptRoot 'local-db-rehearsal.sql') 'rehearsal.log'
  Invoke-RehearsalSql (Join-Path $PSScriptRoot 'local-db-rehearsal-proposals.sql') 'rehearsal-proposals.log'
  $cases = & "$PostgresBin/psql.exe" @rehearsalArgs -Atc "select jsonb_agg(jsonb_build_object('identity',identity,'command',command,'result',result) order by name) from rehearsal_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'SQL contract export failed.' }
  Set-Content -LiteralPath (Join-Path $rehearsalRun 'rehearsal-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output "PASS rehearsal SQL and $($rehearsalMigrations.Count) fresh migrations."
} finally {
  if ($rehearsalStarted) {
    Assert-RehearsalCluster
    & "$PostgresBin/pg_ctl.exe" -D $rehearsalData -m fast -w stop *> (Join-Path $rehearsalRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $rehearsalRun"
}
