param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$memberInvitationRun = Join-Path $env:TEMP ('member-invitation-api-pg-' + [guid]::NewGuid().ToString('N'))
$memberInvitationListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$memberInvitationListener.Start(); $memberInvitationPort = $memberInvitationListener.LocalEndpoint.Port; $memberInvitationListener.Stop()
New-Item -ItemType Directory -Path $memberInvitationRun | Out-Null
Set-Content -LiteralPath (Join-Path $memberInvitationRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback MemberInvitation verification only. No remote data.'
$memberInvitationData = Join-Path $memberInvitationRun 'data'
$memberInvitationArgs = @('-h','127.0.0.1','-p',"$memberInvitationPort",'-U','postgres','-d','memberInvitationverify','-v','ON_ERROR_STOP=1')
$memberInvitationStarted = $false
function Assert-MemberInvitationCluster {
  $actual = & "$PostgresBin/psql.exe" @memberInvitationArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $memberInvitationRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $memberInvitationData).Path) { throw 'Not the owned isolated MemberInvitation cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $memberInvitationData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $memberInvitationRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $memberInvitationStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$memberInvitationData`"",'-l',"`"$(Join-Path $memberInvitationRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $memberInvitationPort`"",'-w','start') -WindowStyle Hidden -PassThru
  $memberInvitationStart.WaitForExit(); if ($memberInvitationStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $memberInvitationStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $memberInvitationPort -U postgres memberInvitationverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $memberInvitationRun -Port $memberInvitationPort -DatabaseName memberInvitationverify
  if ($LASTEXITCODE -ne 0) { throw 'Migration chain application failed.' }
  Assert-MemberInvitationCluster
  & "$PostgresBin/psql.exe" @memberInvitationArgs -f (Join-Path $PSScriptRoot 'local-db-member-invitation.sql') *> (Join-Path $memberInvitationRun 'memberInvitation.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $memberInvitationRun 'memberInvitation.log') -Tail 30; throw 'MemberInvitation SQL verification failed.' }
  # Existing website insert and native creation share a casefold transaction lock.
  $writerFile = Join-Path $memberInvitationRun 'concurrent-writer.sql'
  @'
set application_name='member-invitation-race-writer';
begin;
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
set local role authenticated;
insert into public.team_invitations(team_id,email,role,invited_by) values(member_invitation_test.team(),'RACE@Example.test','member',auth.uid());
select pg_sleep(2);
commit;
'@ | Set-Content -LiteralPath $writerFile
  $writer = Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($memberInvitationArgs + @('-f',"`"$writerFile`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $memberInvitationRun 'concurrent-writer.log') -RedirectStandardError (Join-Path $memberInvitationRun 'concurrent-writer.err')
  $writerSleeping = $false
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    $writerState = & "$PostgresBin/psql.exe" @memberInvitationArgs -Atc "select count(*) from pg_stat_activity where application_name='member-invitation-race-writer' and wait_event='PgSleep'"
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent writer observation failed.' }
    if ($writerState.Trim() -eq '1') { $writerSleeping = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $writerSleeping) { throw 'Concurrent writer did not reach its bounded transaction barrier.' }
  $readerFile = Join-Path $memberInvitationRun 'concurrent-invitation.sql'
  @'
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
set role authenticated;
select member_invitation_test.capture('concurrent-casefold-blocked',member_invitation_test.request(260,'race@example.test'));
reset role;
do $$begin assert (select receipt->>'status'='blocked' and receipt->>'reason'='existing_invitation' from member_invitation_test.cases where name='concurrent-casefold-blocked') and (select count(*)=1 and min(email)='RACE@Example.test' from public.team_invitations where team_id=member_invitation_test.team() and lower(email)='race@example.test'),'Concurrent casefold invitation duplicated or overwritten';end$$;
'@ | Set-Content -LiteralPath $readerFile
  & "$PostgresBin/psql.exe" @memberInvitationArgs -f $readerFile *> (Join-Path $memberInvitationRun 'concurrent-invitation.log')
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent casefold invitation protection failed.' }
  if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Concurrent writer did not commit successfully.' }
  $cases = & "$PostgresBin/psql.exe" @memberInvitationArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from member_invitation_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'MemberInvitation contract export failed.' }
  Set-Content -LiteralPath (Join-Path $memberInvitationRun 'member-invitation-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS saved invitations, casefold concurrency, membership preservation, rollback, current authority, immutable receipts and historical non-revival.'
} finally {
  if ($memberInvitationStarted) {
    Assert-MemberInvitationCluster
    & "$PostgresBin/pg_ctl.exe" -D $memberInvitationData -m fast -w stop *> (Join-Path $memberInvitationRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $memberInvitationRun"
}



