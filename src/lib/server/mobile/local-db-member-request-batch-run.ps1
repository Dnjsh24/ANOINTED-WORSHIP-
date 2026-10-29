param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$memberBatchRun = Join-Path $env:TEMP ('member-request-batch-api-pg-' + [guid]::NewGuid().ToString('N'))
$memberBatchListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$memberBatchListener.Start(); $memberBatchPort = $memberBatchListener.LocalEndpoint.Port; $memberBatchListener.Stop()
New-Item -ItemType Directory -Path $memberBatchRun | Out-Null
Set-Content -LiteralPath (Join-Path $memberBatchRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback MemberBatch verification only. No remote data.'
$memberBatchData = Join-Path $memberBatchRun 'data'
$memberBatchArgs = @('-h','127.0.0.1','-p',"$memberBatchPort",'-U','postgres','-d','memberBatchverify','-v','ON_ERROR_STOP=1')
$memberBatchStarted = $false
function Assert-MemberBatchCluster {
  $actual = & "$PostgresBin/psql.exe" @memberBatchArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $memberBatchRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $memberBatchData).Path) { throw 'Not the owned isolated MemberBatch cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $memberBatchData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $memberBatchRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $memberBatchStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$memberBatchData`"",'-l',"`"$(Join-Path $memberBatchRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $memberBatchPort`"",'-w','start') -WindowStyle Hidden -PassThru
  $memberBatchStart.WaitForExit(); if ($memberBatchStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $memberBatchStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $memberBatchPort -U postgres memberBatchverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $memberBatchRun -Port $memberBatchPort -DatabaseName memberBatchverify
  if ($LASTEXITCODE -ne 0) { throw 'Migration chain application failed.' }
  Assert-MemberBatchCluster
  & "$PostgresBin/psql.exe" @memberBatchArgs -f (Join-Path $PSScriptRoot 'local-db-member-request-decision.sql') *> (Join-Path $memberBatchRun 'memberBatch.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $memberBatchRun 'memberBatch.log') -Tail 30; throw 'MemberBatch SQL verification failed.' }
  & "$PostgresBin/psql.exe" @memberBatchArgs -f (Join-Path $PSScriptRoot 'local-db-member-request-batch.sql') *> (Join-Path $memberBatchRun 'batch.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $memberBatchRun 'batch.log') -Tail 30; throw 'Batch SQL verification failed.' }
  # An overlapping batch waits for the first transaction, then reports conflicts
  # instead of repeating membership creation or upserting an existing member.
  $writerFile = Join-Path $memberBatchRun 'concurrent-writer.sql'
  @'
set application_name='member-batch-race-writer';
begin;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(1)::text,false);
set local role authenticated;
select member_request_batch_test.capture('concurrent-first',member_request_batch_test.request(540,jsonb_build_array(member_request_batch_test.single(240,115),member_request_batch_test.single(241,116))));
select pg_sleep(2);
commit;
'@ | Set-Content -LiteralPath $writerFile
  $writer = Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($memberBatchArgs + @('-f',"`"$writerFile`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $memberBatchRun 'concurrent-writer.log') -RedirectStandardError (Join-Path $memberBatchRun 'concurrent-writer.err')
  $writerSleeping = $false
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    $writerState = & "$PostgresBin/psql.exe" @memberBatchArgs -Atc "select count(*) from pg_stat_activity where application_name='member-batch-race-writer' and wait_event='PgSleep'"
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent batch observation failed.' }
    if ($writerState.Trim() -eq '1') { $writerSleeping = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $writerSleeping) { throw 'Concurrent batch did not reach its bounded transaction barrier.' }
  $readerFile = Join-Path $memberBatchRun 'concurrent-batch.sql'
  @'
select set_config('request.jwt.claim.sub',member_request_batch_test.id(1)::text,false);
set role authenticated;
select member_request_batch_test.capture('concurrent-second',member_request_batch_test.request(541,jsonb_build_array(member_request_batch_test.single(242,115),member_request_batch_test.single(243,116))));
reset role;
do $$begin assert (select bool_and(value->>'status'='conflict') from member_request_batch_test.cases,jsonb_array_elements(receipt->'receipts') where name='concurrent-second') and (select count(*)=2 from public.team_members where team_id=member_request_batch_test.team() and profile_id in(member_request_batch_test.id(15),member_request_batch_test.id(16))),'Concurrent batch repeated membership creation';end$$;
'@ | Set-Content -LiteralPath $readerFile
  & "$PostgresBin/psql.exe" @memberBatchArgs -f $readerFile *> (Join-Path $memberBatchRun 'concurrent-batch.log')
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent batch preservation failed.' }
  if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Concurrent batch writer did not commit successfully.' }
  $cases = & "$PostgresBin/psql.exe" @memberBatchArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from member_request_batch_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'MemberBatch contract export failed.' }
  Set-Content -LiteralPath (Join-Path $memberBatchRun 'member-request-batch-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS atomic approval batches, mixed outcomes,100-item bound, rollback, current authority, immutable retries and overlapping concurrency.'
} finally {
  if ($memberBatchStarted) {
    Assert-MemberBatchCluster
    & "$PostgresBin/pg_ctl.exe" -D $memberBatchData -m fast -w stop *> (Join-Path $memberBatchRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $memberBatchRun"
}



