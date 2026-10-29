param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$customRoleRun = Join-Path $env:TEMP ('custom-role-create-api-pg-' + [guid]::NewGuid().ToString('N'))
$customRoleListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$customRoleListener.Start(); $customRolePort = $customRoleListener.LocalEndpoint.Port; $customRoleListener.Stop()
New-Item -ItemType Directory -Path $customRoleRun | Out-Null
Set-Content -LiteralPath (Join-Path $customRoleRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback CustomRole verification only. No remote data.'
$customRoleData = Join-Path $customRoleRun 'data'
$customRoleArgs = @('-h','127.0.0.1','-p',"$customRolePort",'-U','postgres','-d','customRoleverify','-v','ON_ERROR_STOP=1')
$customRoleStarted = $false
function Assert-CustomRoleCluster {
  $actual = & "$PostgresBin/psql.exe" @customRoleArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $customRoleRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $customRoleData).Path) { throw 'Not the owned isolated CustomRole cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $customRoleData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $customRoleRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $customRoleStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$customRoleData`"",'-l',"`"$(Join-Path $customRoleRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $customRolePort`"",'-w','start') -WindowStyle Hidden -PassThru
  $customRoleStart.WaitForExit(); if ($customRoleStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $customRoleStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $customRolePort -U postgres customRoleverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $customRoleRun -Port $customRolePort -DatabaseName customRoleverify
  if ($LASTEXITCODE -ne 0) { throw 'Migration chain application failed.' }
  Assert-CustomRoleCluster
  & "$PostgresBin/psql.exe" @customRoleArgs -f (Join-Path $PSScriptRoot 'local-db-custom-role-create.sql') *> (Join-Path $customRoleRun 'customRole.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $customRoleRun 'customRole.log') -Tail 30; throw 'CustomRole SQL verification failed.' }
  # The existing website insert and native creation share a casefold name lock.
  $writerFile = Join-Path $customRoleRun 'concurrent-writer.sql'
  @'
set application_name='custom-role-race-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
set local role authenticated;
insert into public.custom_roles(team_id,name,permissions) values(custom_role_create_test.team(),'RACE role',array['songs.create']);
select pg_sleep(2);
commit;
'@ | Set-Content -LiteralPath $writerFile
  $writer = Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($customRoleArgs + @('-f',"`"$writerFile`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $customRoleRun 'concurrent-writer.log') -RedirectStandardError (Join-Path $customRoleRun 'concurrent-writer.err')
  $writerSleeping = $false
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    $writerState = & "$PostgresBin/psql.exe" @customRoleArgs -Atc "select count(*) from pg_stat_activity where application_name='custom-role-race-writer' and wait_event='PgSleep'"
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent role observation failed.' }
    if ($writerState.Trim() -eq '1') { $writerSleeping = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $writerSleeping) { throw 'Concurrent role writer did not reach its bounded transaction barrier.' }
  $readerFile = Join-Path $customRoleRun 'concurrent-role.sql'
  @'
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
set role authenticated;
select custom_role_create_test.capture('concurrent-casefold-blocked',custom_role_create_test.request(240,'race ROLE','["team.manage"]'));
reset role;
do $$begin assert (select receipt->>'status'='blocked' from custom_role_create_test.cases where name='concurrent-casefold-blocked') and (select count(*)=1 and min(name)='RACE role' from public.custom_roles where team_id=custom_role_create_test.team() and lower(name)='race role'),'Concurrent native creation duplicated or overwrote website role';end$$;
'@ | Set-Content -LiteralPath $readerFile
  & "$PostgresBin/psql.exe" @customRoleArgs -f $readerFile *> (Join-Path $customRoleRun 'concurrent-role.log')
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent casefold role protection failed.' }
  if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Concurrent website role writer did not commit successfully.' }
  $cases = & "$PostgresBin/psql.exe" @customRoleArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from custom_role_create_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'CustomRole contract export failed.' }
  Set-Content -LiteralPath (Join-Path $customRoleRun 'custom-role-create-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS owner-only custom-role creation, casefold concurrency, canonical permissions, rollback and immutable retries.'
} finally {
  if ($customRoleStarted) {
    Assert-CustomRoleCluster
    & "$PostgresBin/pg_ctl.exe" -D $customRoleData -m fast -w stop *> (Join-Path $customRoleRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $customRoleRun"
}




