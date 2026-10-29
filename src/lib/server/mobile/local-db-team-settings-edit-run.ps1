param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$teamSettingsRun = Join-Path $env:TEMP ('team-settings-edit-api-pg-' + [guid]::NewGuid().ToString('N'))
$teamSettingsListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$teamSettingsListener.Start(); $teamSettingsPort = $teamSettingsListener.LocalEndpoint.Port; $teamSettingsListener.Stop()
New-Item -ItemType Directory -Path $teamSettingsRun | Out-Null
Set-Content -LiteralPath (Join-Path $teamSettingsRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback TeamSettings verification only. No remote data.'
$teamSettingsData = Join-Path $teamSettingsRun 'data'
$teamSettingsArgs = @('-h','127.0.0.1','-p',"$teamSettingsPort",'-U','postgres','-d','teamSettingsverify','-v','ON_ERROR_STOP=1')
$teamSettingsStarted = $false
function Assert-TeamSettingsCluster {
  $actual = & "$PostgresBin/psql.exe" @teamSettingsArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $teamSettingsRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $teamSettingsData).Path) { throw 'Not the owned isolated TeamSettings cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $teamSettingsData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $teamSettingsRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $teamSettingsStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$teamSettingsData`"",'-l',"`"$(Join-Path $teamSettingsRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $teamSettingsPort`"",'-w','start') -WindowStyle Hidden -PassThru
  $teamSettingsStart.WaitForExit(); if ($teamSettingsStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $teamSettingsStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $teamSettingsPort -U postgres teamSettingsverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $teamSettingsRun -Port $teamSettingsPort -DatabaseName teamSettingsverify
  if ($LASTEXITCODE -ne 0) { throw 'Migration chain application failed.' }
  Assert-TeamSettingsCluster
  & "$PostgresBin/psql.exe" @teamSettingsArgs -f (Join-Path $PSScriptRoot 'local-db-team-settings-edit.sql') *> (Join-Path $teamSettingsRun 'teamSettings.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $teamSettingsRun 'teamSettings.log') -Tail 30; throw 'TeamSettings SQL verification failed.' }
  # Existing website row writes and native CAS must serialize without overwriting.
  $writerFile = Join-Path $teamSettingsRun 'concurrent-writer.sql'
  @'
set application_name='team-settings-race-writer';
begin;
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(1)::text,false);
set local role authenticated;
update public.team_settings set default_service_location='Website concurrent chapel' where team_id=team_settings_edit_test.team();
select pg_sleep(2);
commit;
'@ | Set-Content -LiteralPath $writerFile
  $writer = Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($teamSettingsArgs + @('-f',"`"$writerFile`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $teamSettingsRun 'concurrent-writer.log') -RedirectStandardError (Join-Path $teamSettingsRun 'concurrent-writer.err')
  $writerSleeping = $false
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    $writerState = & "$PostgresBin/psql.exe" @teamSettingsArgs -Atc "select count(*) from pg_stat_activity where application_name='team-settings-race-writer' and wait_event='PgSleep'"
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent settings observation failed.' }
    if ($writerState.Trim() -eq '1') { $writerSleeping = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $writerSleeping) { throw 'Concurrent settings writer did not reach its bounded transaction barrier.' }
  $readerFile = Join-Path $teamSettingsRun 'concurrent-settings.sql'
  @'
select set_config('request.jwt.claim.sub',team_settings_edit_test.id(1)::text,false);
set role authenticated;
select team_settings_edit_test.capture('concurrent-website-conflict',(select request from team_settings_edit_test.saved where request->>'requestNonce'=team_settings_edit_test.id(240)::text));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from team_settings_edit_test.cases where name='concurrent-website-conflict') and (select default_service_location='Website concurrent chapel' and dashboard_widgets=array['retainedWidget'] from public.team_settings where team_id=team_settings_edit_test.team()) and (select name='Rollback ministry' from public.teams where id=team_settings_edit_test.team()),'Concurrent native CAS overwrote website defaults or renamed team';end$$;
'@ | Set-Content -LiteralPath $readerFile
  & "$PostgresBin/psql.exe" @teamSettingsArgs -f $readerFile *> (Join-Path $teamSettingsRun 'concurrent-settings.log')
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent website settings preservation failed.' }
  if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Concurrent website writer did not commit successfully.' }
  $cases = & "$PostgresBin/psql.exe" @teamSettingsArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from team_settings_edit_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'TeamSettings contract export failed.' }
  Set-Content -LiteralPath (Join-Path $teamSettingsRun 'team-settings-edit-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS atomic defaults, CAS, precision preservation, rollback, current authority and historical non-revival.'
} finally {
  if ($teamSettingsStarted) {
    Assert-TeamSettingsCluster
    & "$PostgresBin/pg_ctl.exe" -D $teamSettingsData -m fast -w stop *> (Join-Path $teamSettingsRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $teamSettingsRun"
}




