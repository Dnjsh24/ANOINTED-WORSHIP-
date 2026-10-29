param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$serviceRun = Join-Path $env:TEMP ('mobile-service-command-pg-' + [guid]::NewGuid().ToString('N'))
$serviceListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$serviceListener.Start()
$servicePort = $serviceListener.LocalEndpoint.Port
$serviceListener.Stop()
New-Item -ItemType Directory -Path $serviceRun | Out-Null
Set-Content -LiteralPath (Join-Path $serviceRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback service-command SQL test cluster. Synthetic accounts only.'
$serviceData = Join-Path $serviceRun 'data'
$serviceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$serviceArgs = @('-h','127.0.0.1','-p',"$servicePort",'-U','postgres','-d','servicecommandverify','-v','ON_ERROR_STOP=1')
$serviceStarted = $false
function Assert-ServiceCommandCluster {
  if (-not (Test-Path -LiteralPath (Join-Path $serviceRun 'MOBILE-VERIFICATION-ONLY'))) { throw 'Missing isolated-cluster marker.' }
  $serviceActualData = & "$PostgresBin/psql.exe" @serviceArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $serviceActualData.Trim()).Path -ne (Resolve-Path -LiteralPath $serviceData).Path) { throw 'Connected database is not this isolated cluster.' }
}
function Invoke-ServiceCommandSql([string]$File,[string]$Log) {
  Assert-ServiceCommandCluster
  & "$PostgresBin/psql.exe" @serviceArgs -f $File *> (Join-Path $serviceRun $Log)
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $serviceRun $Log) -Tail 22; throw "SQL verification failed: $Log" }
}
try {
  & "$PostgresBin/initdb.exe" -D $serviceData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $serviceRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
  $serviceStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$serviceData`"",'-l',"`"$(Join-Path $serviceRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $servicePort`"",'-w','start') -WindowStyle Hidden -PassThru
  $serviceStart.WaitForExit()
  if ($serviceStart.ExitCode -ne 0) { throw 'Cluster start failed.' }
  $serviceStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $servicePort -U postgres servicecommandverify
  if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed.' }
  Invoke-ServiceCommandSql -File (Join-Path $PSScriptRoot 'local-db-bootstrap.sql') -Log 'bootstrap.log'
  $serviceMigrations = Get-ChildItem (Join-Path $serviceRoot 'supabase/migrations/*.sql') | Sort-Object Name
  foreach ($serviceMigration in $serviceMigrations) {
    $serviceSql = Get-Content -Raw -LiteralPath $serviceMigration.FullName
    $serviceSql = $serviceSql -replace '(?im)^create extension if not exists pg_net with schema extensions;','-- Local verification: pg_net stubbed; no HTTP calls.'
    $serviceCopy = Join-Path $serviceRun $serviceMigration.Name
    Set-Content -LiteralPath $serviceCopy -Value $serviceSql -Encoding utf8
    Invoke-ServiceCommandSql -File $serviceCopy -Log ($serviceMigration.Name + '.log')
  }
  Invoke-ServiceCommandSql -File (Join-Path $PSScriptRoot 'local-db-service-commands.sql') -Log 'service-commands.log'
  Write-Output "PASS service-command validation/shared-services/retry/conflict/authorization checks; $($serviceMigrations.Count) migrations applied."
  $serviceWriters = @()
  foreach ($serviceLabel in @('first','second')) {
    $serviceRaceFile = Join-Path $serviceRun "concurrent-$serviceLabel.sql"
    Set-Content -LiteralPath $serviceRaceFile -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
begin;
set local statement_timeout='15s';
set role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
insert into service_test.race_results(value) select public.mobile_apply_service_commands(
 (select value from public.service_command_test_ids where key='teamA'),
 (select value from public.service_command_test_ids where key='ownerA'),
 jsonb_build_array((select command from service_test.race_command)));
select pg_sleep(0.3);
commit;
'@
    $serviceProcessArgs = @('-h','127.0.0.1','-p',"$servicePort",'-U','postgres','-d','servicecommandverify','-v','ON_ERROR_STOP=1','-f',"`"$serviceRaceFile`"")
    $serviceWriters += Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList $serviceProcessArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $serviceRun "concurrent-$serviceLabel.out") -RedirectStandardError (Join-Path $serviceRun "concurrent-$serviceLabel.err")
  }
  foreach ($serviceWriter in $serviceWriters) { $serviceWriter.WaitForExit(); if ($serviceWriter.ExitCode -ne 0) { throw 'Concurrent command writer failed; inspect retained logs.' } }
  $serviceRaceCheck = Join-Path $serviceRun 'concurrent-check.sql'
  Set-Content -LiteralPath $serviceRaceCheck -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
do $$begin
 assert (select count(*)=2 and count(distinct value)=1 from service_test.race_results),'concurrent retries returned different results';
 assert (select count(*)=1 from public.mobile_workflow_command_receipts where command_id=service_test.id(190)),'duplicate concurrent receipts';
 assert (select revision=(select base_revision+1 from service_test.race_command) from public.service_orders where event_id=service_test.id(10)),'concurrent retry applied more than once';
 raise notice 'PASS concurrent duplicate RPC submissions apply exactly once and return identical results';
end$$;
'@
  Invoke-ServiceCommandSql -File $serviceRaceCheck -Log 'concurrent-check.log'
  # Actual SQL command/result bodies feed the TypeScript contract boundary test.
  Assert-ServiceCommandCluster
  $serviceExport = & "$PostgresBin/psql.exe" @serviceArgs -Atc "select jsonb_agg(jsonb_build_object('identity',identity,'command',command,'result',result) order by name) from service_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'SQL contract export failed.' }
  Set-Content -LiteralPath (Join-Path $serviceRun 'contract-cases.json') -Value $serviceExport -Encoding utf8
  Write-Output "PASS concurrent retries. SQL contract cases: $(Join-Path $serviceRun 'contract-cases.json')"
  foreach ($serviceRegression in @(
    @{ Name='workflow-commands'; File='docs/mobile/sql-evidence/event-commands-release-2026-10-16/event-workflow-regression.sql' },
    @{ Name='event-commands'; File='docs/mobile/sql-evidence/event-commands-2026-10-16.sql' },
    @{ Name='event-notification-delete'; File='docs/mobile/sql-evidence/event-notification-delete-2026-10-16.sql' }
  )) {
    Invoke-ServiceCommandSql -File (Join-Path $serviceRoot $serviceRegression.File) -Log "$($serviceRegression.Name)-regression.log"
    Write-Output "PASS existing SQL regression $($serviceRegression.Name)"
  }
  Write-Output "PostgreSQL18 loopback port $servicePort. Auth/storage/realtime scaffolds and no-network pg_net stub; not a genuine Supabase/PostgREST installation."
} finally {
  if ($serviceStarted) {
    Assert-ServiceCommandCluster
    & "$PostgresBin/pg_ctl.exe" -D $serviceData -m fast -w stop *> (Join-Path $serviceRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed; inspect retained evidence.' }
    & "$PostgresBin/pg_ctl.exe" -D $serviceData status *> (Join-Path $serviceRun 'final-status.log')
    if ($LASTEXITCODE -ne 3) { throw 'Isolated cluster did not report stopped.' }
  }
  Write-Output "Evidence retained: $serviceRun"
}
exit 0
