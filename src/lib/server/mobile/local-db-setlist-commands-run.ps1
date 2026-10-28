param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$aggregateRun = Join-Path $env:TEMP ('mobile-setlist-api-pg-' + [guid]::NewGuid().ToString('N'))
$aggregateListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$aggregateListener.Start(); $aggregatePort = $aggregateListener.LocalEndpoint.Port; $aggregateListener.Stop()
New-Item -ItemType Directory -Path $aggregateRun | Out-Null
Set-Content -LiteralPath (Join-Path $aggregateRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback setlist SQL cluster. Synthetic accounts; no remote data.'
$aggregateData = Join-Path $aggregateRun 'data'
$aggregateRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$aggregateArgs = @('-h','127.0.0.1','-p',"$aggregatePort",'-U','postgres','-d','setlistverify','-v','ON_ERROR_STOP=1')
$aggregateStarted = $false
function Assert-AggregateCluster {
  if (-not (Test-Path -LiteralPath (Join-Path $aggregateRun 'MOBILE-VERIFICATION-ONLY'))) { throw 'Missing isolated-cluster marker.' }
  $actualData = & "$PostgresBin/psql.exe" @aggregateArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $actualData.Trim()).Path -ne (Resolve-Path -LiteralPath $aggregateData).Path) { throw 'Database is not the owned disposable cluster.' }
}
function Invoke-AggregateSql([string]$File,[string]$Log) {
  Assert-AggregateCluster
  & "$PostgresBin/psql.exe" @aggregateArgs -f $File *> (Join-Path $aggregateRun $Log)
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $aggregateRun $Log) -Tail 25; throw "SQL verification failed: $Log" }
}
try {
  & "$PostgresBin/initdb.exe" -D $aggregateData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $aggregateRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
  $aggregateStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$aggregateData`"",'-l',"`"$(Join-Path $aggregateRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $aggregatePort`"",'-w','start') -WindowStyle Hidden -PassThru
  $aggregateStart.WaitForExit(); if ($aggregateStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $aggregateStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $aggregatePort -U postgres setlistverify
  if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed.' }
  Invoke-AggregateSql (Join-Path $PSScriptRoot 'local-db-bootstrap.sql') 'bootstrap.log'
  $aggregateMigrations = Get-ChildItem (Join-Path $aggregateRoot 'supabase/migrations/*.sql') | Sort-Object Name
  foreach ($migration in $aggregateMigrations) {
    $sql = (Get-Content -Raw -LiteralPath $migration.FullName) -replace '(?im)^create extension if not exists pg_net with schema extensions;','-- Disposable verification: no-network pg_net stub.'
    $copy = Join-Path $aggregateRun $migration.Name
    Set-Content -LiteralPath $copy -Value $sql -Encoding utf8
    Invoke-AggregateSql $copy ($migration.Name + '.log')
  }
  Invoke-AggregateSql (Join-Path $PSScriptRoot 'local-db-setlist-aggregate.sql') 'setlist-aggregate.log'
  Write-Output "PASS aggregate fixture; $($aggregateMigrations.Count) fresh migrations."
  $aggregateWriters = @()
  foreach ($label in @('first','second')) {
    $raceFile = Join-Path $aggregateRun "concurrent-$label.sql"
    Set-Content -LiteralPath $raceFile -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
set statement_timeout='15s';
select set_config('request.jwt.claim.sub',setlist_test.id(1)::text,false);
do $$declare t uuid; b jsonb; i jsonb; r bigint;
begin
 select id into t from setlist_test.ids where key='teamA'; select base,intent,revision into b,i,r from setlist_test.race;
 begin
  perform private.save_setlist_workspace_core(t,setlist_test.id(30),null,setlist_test.details(),array[setlist_test.id(11),setlist_test.id(11)],null,r,i);
  perform pg_sleep(0.2);
  insert into setlist_test.race_results values('applied');
 exception when sqlstate '40001' then insert into setlist_test.race_results values('conflict'); end;
end$$;
'@
    $writerArgs = @('-h','127.0.0.1','-p',"$aggregatePort",'-U','postgres','-d','setlistverify','-v','ON_ERROR_STOP=1','-f',"`"$raceFile`"")
    $aggregateWriters += Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList $writerArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $aggregateRun "concurrent-$label.out") -RedirectStandardError (Join-Path $aggregateRun "concurrent-$label.err")
  }
  foreach ($writer in $aggregateWriters) { $writer.WaitForExit(); if ($writer.ExitCode -ne 0) { throw 'Concurrent aggregate writer failed; see retained logs.' } }
  $raceCheck = Join-Path $aggregateRun 'concurrent-check.sql'
  Set-Content -LiteralPath $raceCheck -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
do $$begin
 assert (select count(*)=2 and count(*) filter(where outcome='applied')=1 and count(*) filter(where outcome='conflict')=1 from setlist_test.race_results),'concurrent stale base overwrote work';
 raise notice 'PASS concurrent native saves serialize: one applied, one conflict';
end$$;
'@
  Invoke-AggregateSql $raceCheck 'concurrent-check.log'
  Invoke-AggregateSql (Join-Path $PSScriptRoot 'local-db-setlist-commands.sql') 'setlist-commands.log'
  $apiWriters = @()
  foreach ($label in @('first','second')) {
    $apiRaceFile = Join-Path $aggregateRun "api-concurrent-$label.sql"
    Set-Content -LiteralPath $apiRaceFile -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
begin;
set local statement_timeout='15s';
select set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
set local role authenticated;
insert into setlist_api_test.race_results(value) select public.mobile_apply_setlist_commands(
 (select id from setlist_test.ids where key='teamA'),
 (select id from public.team_members where profile_id=auth.uid() and team_id=(select id from setlist_test.ids where key='teamA')),
 jsonb_build_array((select command from setlist_api_test.race_command)));
select pg_sleep(0.2);
commit;
'@
    $apiWriterArgs = @('-h','127.0.0.1','-p',"$aggregatePort",'-U','postgres','-d','setlistverify','-v','ON_ERROR_STOP=1','-f',"`"$apiRaceFile`"")
    $apiWriters += Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList $apiWriterArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $aggregateRun "api-concurrent-$label.out") -RedirectStandardError (Join-Path $aggregateRun "api-concurrent-$label.err")
  }
  foreach ($writer in $apiWriters) { $writer.WaitForExit(); if ($writer.ExitCode -ne 0) { throw 'Concurrent command retry failed; see retained logs.' } }
  $apiRaceCheck = Join-Path $aggregateRun 'api-concurrent-check.sql'
  Set-Content -LiteralPath $apiRaceCheck -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
do $$begin
 assert (select count(*)=2 and count(distinct value)=1 and bool_and(value->0->>'status'='applied') from setlist_api_test.race_results),'exact concurrent retry returned different confirmations';
 assert (select count(*)=1 from public.mobile_setlist_command_receipts where command_id=setlist_test.id(690)),'duplicate receipts';
 assert (select count(*)=3 from public.setlist_songs where setlist_id=setlist_test.id(790)),'duplicate or missing template slots';
 assert (select count(*)=1 from public.activity_logs where target_id=setlist_test.id(790)),'duplicate activity';
 raise notice 'PASS concurrent exact template create retries commit once and return identical receipts';
end$$;
'@
  Invoke-AggregateSql $apiRaceCheck 'api-concurrent-check.log'
  Assert-AggregateCluster
  $apiCases = & "$PostgresBin/psql.exe" @aggregateArgs -Atc "select jsonb_agg(jsonb_build_object('identity',identity,'command',command,'result',result) order by name) from setlist_api_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'SQL result export failed.' }
  Set-Content -LiteralPath (Join-Path $aggregateRun 'contract-cases.json') -Value $apiCases -Encoding utf8
  $apiReviews = & "$PostgresBin/psql.exe" @aggregateArgs -Atc "select jsonb_agg(jsonb_build_object('identity',identity,'setlistId',setlist_id,'review',review) order by name) from setlist_api_test.reviews"
  if ($LASTEXITCODE -ne 0) { throw 'SQL deletion scope export failed.' }
  Set-Content -LiteralPath (Join-Path $aggregateRun 'delete-reviews.json') -Value $apiReviews -Encoding utf8
  Write-Output 'PASS setlist command execution, receipt replay/collisions/revocation, duplicate retry concurrency and exported SQL contracts.'

  foreach ($regression in @(
    @{ Name='service'; File='src/lib/server/mobile/local-db-service-commands.sql' },
    @{ Name='workflow'; File='docs/mobile/sql-evidence/event-commands-release-2026-10-16/event-workflow-regression.sql' },
    @{ Name='event'; File='docs/mobile/sql-evidence/event-commands-2026-10-16.sql' },
    @{ Name='notification'; File='docs/mobile/sql-evidence/event-notification-delete-2026-10-16.sql' }
  )) { Invoke-AggregateSql (Join-Path $aggregateRoot $regression.File) ($regression.Name + '-regression.log'); Write-Output "PASS existing SQL $($regression.Name) regression" }
  Write-Output "PASS typed CAS, shared website/native saves, templates, cascade consent and concurrent writers. Local PostgreSQL18 scaffolding; not genuine Supabase/PostgREST."
} finally {
  if ($aggregateStarted) {
    Assert-AggregateCluster
    & "$PostgresBin/pg_ctl.exe" -D $aggregateData -m fast -w stop *> (Join-Path $aggregateRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Disposable cluster stop failed.' }
    & "$PostgresBin/pg_ctl.exe" -D $aggregateData status *> (Join-Path $aggregateRun 'final-status.log')
    if ($LASTEXITCODE -ne 3) { throw 'Disposable cluster is not stopped.' }
  }
  Write-Output "Evidence retained: $aggregateRun"
}
exit 0

