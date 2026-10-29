param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$memberDecisionRun = Join-Path $env:TEMP ('member-decision-api-pg-' + [guid]::NewGuid().ToString('N'))
$memberDecisionListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$memberDecisionListener.Start(); $memberDecisionPort = $memberDecisionListener.LocalEndpoint.Port; $memberDecisionListener.Stop()
New-Item -ItemType Directory -Path $memberDecisionRun | Out-Null
Set-Content -LiteralPath (Join-Path $memberDecisionRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback MemberDecision verification only. No remote data.'
$memberDecisionData = Join-Path $memberDecisionRun 'data'
$memberDecisionArgs = @('-h','127.0.0.1','-p',"$memberDecisionPort",'-U','postgres','-d','memberDecisionverify','-v','ON_ERROR_STOP=1')
$memberDecisionStarted = $false
function Assert-MemberDecisionCluster {
  $actual = & "$PostgresBin/psql.exe" @memberDecisionArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $memberDecisionRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $memberDecisionData).Path) { throw 'Not the owned isolated MemberDecision cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $memberDecisionData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $memberDecisionRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $memberDecisionStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$memberDecisionData`"",'-l',"`"$(Join-Path $memberDecisionRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $memberDecisionPort`"",'-w','start') -WindowStyle Hidden -PassThru
  $memberDecisionStart.WaitForExit(); if ($memberDecisionStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $memberDecisionStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $memberDecisionPort -U postgres memberDecisionverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $memberDecisionRun -Port $memberDecisionPort -DatabaseName memberDecisionverify
  if ($LASTEXITCODE -ne 0) { throw 'Migration chain application failed.' }
  Assert-MemberDecisionCluster
  & "$PostgresBin/psql.exe" @memberDecisionArgs -f (Join-Path $PSScriptRoot 'local-db-member-request-decision.sql') *> (Join-Path $memberDecisionRun 'memberDecision.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $memberDecisionRun 'memberDecision.log') -Tail 30; throw 'MemberDecision SQL verification failed.' }
  # A concurrent old caller inserts a privileged membership before review acquires
  # the requester profile lock. The wrapper must observe and preserve that row.
  $writerFile = Join-Path $memberDecisionRun 'concurrent-writer.sql'
  @'
set application_name='member-decision-race-writer';
begin;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values(member_request_decision_test.id(16),member_request_decision_test.team(),member_request_decision_test.id(18),'admin','active');
select pg_sleep(2);
commit;
'@ | Set-Content -LiteralPath $writerFile
  $writer = Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($memberDecisionArgs + @('-f',"`"$writerFile`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $memberDecisionRun 'concurrent-writer.log') -RedirectStandardError (Join-Path $memberDecisionRun 'concurrent-writer.err')
  $writerSleeping = $false
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    $writerState = & "$PostgresBin/psql.exe" @memberDecisionArgs -Atc "select count(*) from pg_stat_activity where application_name='member-decision-race-writer' and wait_event='PgSleep'"
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent writer observation failed.' }
    if ($writerState.Trim() -eq '1') { $writerSleeping = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $writerSleeping) { throw 'Concurrent writer did not reach its bounded transaction barrier.' }
  $readerFile = Join-Path $memberDecisionRun 'concurrent-review.sql'
  @'
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
set role authenticated;
select member_request_decision_test.capture('concurrent-membership-blocked',member_request_decision_test.request(260,member_request_decision_test.id(120)));
reset role;
do $$begin assert (select receipt->>'status'='blocked' and receipt->>'reason'='existing_membership' from member_request_decision_test.cases where name='concurrent-membership-blocked') and (select role='admin' and status='active' from public.team_members where id=member_request_decision_test.id(16)) and (select status='pending' from public.join_requests where id=member_request_decision_test.id(120)),'Concurrent privileged membership was overwritten';end$$;
'@ | Set-Content -LiteralPath $readerFile
  & "$PostgresBin/psql.exe" @memberDecisionArgs -f $readerFile *> (Join-Path $memberDecisionRun 'concurrent-review.log')
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent membership preservation failed.' }
  if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Concurrent writer did not commit successfully.' }
  $cases = & "$PostgresBin/psql.exe" @memberDecisionArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from member_request_decision_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'MemberDecision contract export failed.' }
  Set-Content -LiteralPath (Join-Path $memberDecisionRun 'member-request-decision-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS join-request decisions, membership preservation, rollback, current authority, immutable receipts and historical non-revival.'
} finally {
  if ($memberDecisionStarted) {
    Assert-MemberDecisionCluster
    & "$PostgresBin/pg_ctl.exe" -D $memberDecisionData -m fast -w stop *> (Join-Path $memberDecisionRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $memberDecisionRun"
}


