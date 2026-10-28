param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$serviceRun = Join-Path $env:TEMP ('mobile-service-response-pg-' + [guid]::NewGuid().ToString('N'))
$serviceListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$serviceListener.Start()
$servicePort = $serviceListener.LocalEndpoint.Port
$serviceListener.Stop()
New-Item -ItemType Directory -Path $serviceRun | Out-Null
Set-Content -LiteralPath (Join-Path $serviceRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback service-response revision SQL test cluster. No user data.'
$serviceData = Join-Path $serviceRun 'data'
$serviceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$serviceArgs = @('-h','127.0.0.1','-p',"$servicePort",'-U','postgres','-d','serviceresponseverify','-v','ON_ERROR_STOP=1')
$serviceStarted = $false
function Assert-ServiceCluster {
  if (-not (Test-Path -LiteralPath (Join-Path $serviceRun 'MOBILE-VERIFICATION-ONLY'))) { throw 'Missing isolated-cluster marker.' }
  $serviceActualData = & "$PostgresBin/psql.exe" @serviceArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $serviceActualData.Trim()).Path -ne (Resolve-Path -LiteralPath $serviceData).Path) { throw 'Connected database is not this isolated cluster.' }
}
function Invoke-ServiceSql([string]$File,[string]$Log,[string[]]$Variables = @(),[string]$DatabaseName = 'serviceresponseverify') {
  Assert-ServiceCluster
  if ($DatabaseName -notin @('serviceresponseverify','serviceregressionverify')) { throw 'SQL target is not a runner-created database.' }
  & "$PostgresBin/psql.exe" @serviceArgs -d $DatabaseName @Variables -f $File *> (Join-Path $serviceRun $Log)
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $serviceRun $Log) -Tail 18; throw "SQL verification failed: $Log" }
}
try {
  & "$PostgresBin/initdb.exe" -D $serviceData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $serviceRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
  $serviceStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$serviceData`"",'-l',"`"$(Join-Path $serviceRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $servicePort`"",'-w','start') -WindowStyle Hidden -PassThru
  $serviceStart.WaitForExit()
  if ($serviceStart.ExitCode -ne 0) { throw 'Cluster start failed.' }
  $serviceStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $servicePort -U postgres serviceresponseverify
  if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed.' }
  Invoke-ServiceSql -File (Join-Path $PSScriptRoot 'local-db-bootstrap.sql') -Log 'bootstrap.log'
  $serviceMigrations = Get-ChildItem (Join-Path $serviceRoot 'supabase/migrations/*.sql') | Sort-Object Name
  $serviceNewMigration = '20261017010000_mobile_service_response_revisions.sql'
  foreach ($serviceMigration in $serviceMigrations) {
    if ($serviceMigration.Name -eq $serviceNewMigration) {
      # Preserve a clean baseline for earlier workflow regressions with their own IDs.
      Assert-ServiceCluster
      & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $servicePort -U postgres -T serviceresponseverify serviceregressionverify
      if ($LASTEXITCODE -ne 0) { throw 'Clean regression database clone failed.' }
      Invoke-ServiceSql -File (Join-Path $PSScriptRoot 'local-db-service-responses.sql') -Log 'before-migration.log' -Variables @('-v','service_before=1')
      & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $servicePort -U postgres -T serviceresponseverify serviceinvalidverify
      if ($LASTEXITCODE -ne 0) { throw 'Invalid-data rollback database clone failed.' }
    }
    $serviceSql = Get-Content -Raw -LiteralPath $serviceMigration.FullName
    $serviceSql = $serviceSql -replace '(?im)^create extension if not exists pg_net with schema extensions;','-- Local verification: pg_net stubbed; no HTTP calls.'
    $serviceCopy = Join-Path $serviceRun $serviceMigration.Name
    Set-Content -LiteralPath $serviceCopy -Value $serviceSql -Encoding utf8
    Invoke-ServiceSql -File $serviceCopy -Log ($serviceMigration.Name + '.log')
  }
  Assert-ServiceCluster
  $serviceInvalidArgs = @('-h','127.0.0.1','-p',"$servicePort",'-U','postgres','-d','serviceinvalidverify','-v','ON_ERROR_STOP=1')
  & "$PostgresBin/psql.exe" @serviceInvalidArgs -c "update public.assignment_responses set team_member_id=(select value from public.service_revision_test_ids where key='ownerB') where assignment_id='91000000-0000-4000-8000-000000000020'" *> (Join-Path $serviceRun 'invalid-data-fixture.log')
  if ($LASTEXITCODE -ne 0) { throw 'Invalid-data fixture setup failed.' }
  & "$PostgresBin/psql.exe" @serviceInvalidArgs -f (Join-Path $serviceRun $serviceNewMigration) *> (Join-Path $serviceRun 'expected-migration-rejection.log')
  if ($LASTEXITCODE -eq 0 -or -not (Select-String -LiteralPath (Join-Path $serviceRun 'expected-migration-rejection.log') -SimpleMatch 'Resolve cross-team assignment response data before migrating')) { throw 'Migration did not reject the deliberately invalid scope as expected.' }
  $serviceRollbackFile = Join-Path $serviceRun 'invalid-data-rollback-check.sql'
  Set-Content -LiteralPath $serviceRollbackFile -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
do $$begin
 assert not exists(select 1 from information_schema.columns where table_schema='public' and table_name='assignment_responses' and column_name='sync_revision'),'failed migration retained new column';
 assert to_regclass('public.mobile_service_assignment_state') is null and to_regclass('public.mobile_service_assignment_changes') is null,'failed migration retained state/history tables';
 assert exists(select 1 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020' and note='Old note' and team_member_id=(select value from public.service_revision_test_ids where key='ownerB')),'failed migration modified prior fixture';
 raise notice 'PASS invalid cross-team data rejects migration and rolls back all schema/data changes';
end$$;
'@
  & "$PostgresBin/psql.exe" @serviceInvalidArgs -f $serviceRollbackFile *> (Join-Path $serviceRun 'invalid-data-rollback-check.log')
  if ($LASTEXITCODE -ne 0) { throw 'Invalid-data migration rollback check failed.' }
  Write-Output 'PASS invalid cross-team backfill rejection and complete migration rollback.'
  Invoke-ServiceSql -File (Join-Path $PSScriptRoot 'local-db-service-responses.sql') -Log 'service-revisions.log' -Variables @('-v','service_before=0')
  Write-Output "PASS service response migration/backfill/RPC/revision/history/RLS/cascade checks; $($serviceMigrations.Count) migrations applied."
  Assert-ServiceCluster
  $serviceWriters = @()
  foreach ($serviceLabel in @('first','second')) {
    $serviceRaceFile = Join-Path $serviceRun "concurrent-$serviceLabel.sql"
    $serviceRaceSql = @"
\set ON_ERROR_STOP on
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select public.respond_assignment('91000000-0000-4000-8000-000000000024','confirmed','Concurrent $serviceLabel');
select pg_sleep(1);
commit;
"@
    Set-Content -LiteralPath $serviceRaceFile -Value $serviceRaceSql -Encoding utf8
    $serviceProcessArgs = @('-h','127.0.0.1','-p',"$servicePort",'-U','postgres','-d','serviceresponseverify','-v','ON_ERROR_STOP=1','-f',"`"$serviceRaceFile`"")
    $serviceWriters += Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList $serviceProcessArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $serviceRun "concurrent-$serviceLabel.out") -RedirectStandardError (Join-Path $serviceRun "concurrent-$serviceLabel.err")
  }
  foreach ($serviceWriter in $serviceWriters) { $serviceWriter.WaitForExit(); if ($serviceWriter.ExitCode -ne 0) { throw 'Concurrent response writer failed; inspect retained logs.' } }
  $serviceRaceCheck = Join-Path $serviceRun 'concurrent-check.sql'
  Set-Content -LiteralPath $serviceRaceCheck -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
do $$begin
 assert (select sync_revision=3 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000024'),'concurrent writers lost a revision';
 assert (select revision=3 and not deleted from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000024'),'concurrent state differs from live response';
 assert (select count(*)=3 and count(distinct revision)=3 from public.mobile_service_assignment_changes where assignment_id='91000000-0000-4000-8000-000000000024'),'concurrent writes lost/duplicated history';
 raise notice 'PASS concurrent existing website RPC writers preserve revisions/history';
end$$;
'@
  Invoke-ServiceSql -File $serviceRaceCheck -Log 'concurrent-check.log'
  Write-Output "PASS concurrent website RPC response writes. PostgreSQL18 loopback port $servicePort; auth/storage/realtime scaffolds and no-network pg_net stub. Genuine Supabase/PostgREST remains unverified."
  Invoke-ServiceSql -File (Join-Path $serviceRun $serviceNewMigration) -Log 'regression-migration.log' -DatabaseName 'serviceregressionverify'
  foreach ($serviceRegression in @(
    @{ Name='workflow-commands'; File='docs/mobile/sql-evidence/event-commands-release-2026-10-16/event-workflow-regression.sql' },
    @{ Name='event-commands'; File='docs/mobile/sql-evidence/event-commands-2026-10-16.sql' },
    @{ Name='event-notification-delete'; File='docs/mobile/sql-evidence/event-notification-delete-2026-10-16.sql' }
  )) {
    Invoke-ServiceSql -File (Join-Path $serviceRoot $serviceRegression.File) -Log "$($serviceRegression.Name)-regression.log" -DatabaseName 'serviceregressionverify'
    Write-Output "PASS existing SQL regression $($serviceRegression.Name)"
  }
} finally {
  if ($serviceStarted) {
    Assert-ServiceCluster
    & "$PostgresBin/pg_ctl.exe" -D $serviceData -m fast -w stop *> (Join-Path $serviceRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed; inspect retained evidence.' }
    & "$PostgresBin/pg_ctl.exe" -D $serviceData status *> (Join-Path $serviceRun 'final-status.log')
    if ($LASTEXITCODE -ne 3) { throw 'Isolated cluster did not report stopped.' }
  }
  Write-Output "Evidence retained: $serviceRun"
}
exit 0
