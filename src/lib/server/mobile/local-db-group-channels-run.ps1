param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$editRun = Join-Path $env:TEMP ('group-channels-api-pg-' + [guid]::NewGuid().ToString('N'))
$editListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$editListener.Start(); $editPort = $editListener.LocalEndpoint.Port; $editListener.Stop()
New-Item -ItemType Directory -Path $editRun | Out-Null
Set-Content -LiteralPath (Join-Path $editRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback role deletion verification only.'
$editData = Join-Path $editRun 'data'
$editArgs = @('-h','127.0.0.1','-p',"$editPort",'-U','postgres','-d','roleeditverify','-v','ON_ERROR_STOP=1')
$editStarted = $false
function Assert-EditCluster {
 $actual = & "$PostgresBin/psql.exe" @editArgs -Atc 'show data_directory'
 if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $editRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $editData).Path) { throw 'Not the owned isolated deletion cluster.' }
}
function Invoke-EditSql([string]$Name,[string]$Sql) {
 $file = Join-Path $editRun ($Name + '.sql')
 Set-Content -LiteralPath $file -Value $Sql
 & "$PostgresBin/psql.exe" @editArgs -f $file *> (Join-Path $editRun ($Name + '.log'))
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun ($Name + '.log')) -Tail 25; throw "SQL failed: $Name" }
}
function Start-EditWriter([string]$Name,[string]$Sql) {
 $file=Join-Path $editRun ($Name+'.sql');Set-Content -LiteralPath $file -Value $Sql
 $writer=Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($editArgs+@('-f',"`"$file`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $editRun ($Name+'.log')) -RedirectStandardError (Join-Path $editRun ($Name+'.err'))
 $ready=$false
 for ($attempt=0;$attempt -lt 50;$attempt++) {
  $state=& "$PostgresBin/psql.exe" @editArgs -Atc "select count(*) from pg_stat_activity where application_name='$Name' and wait_event='PgSleep'"
  if ($LASTEXITCODE -ne 0) { throw 'Race barrier observation failed.' }
  if ($state.Trim() -eq '1') { $ready=$true;break };Start-Sleep -Milliseconds 100
 }
 if (-not $ready) { throw "Writer did not reach transaction barrier: $Name" }
 return $writer
}
try {
 & "$PostgresBin/initdb.exe" -D $editData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $editRun 'initdb.log')
 if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
 $start=Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$editData`"",'-l',"`"$(Join-Path $editRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $editPort`"",'-w','start') -WindowStyle Hidden -PassThru
 $start.WaitForExit();if ($start.ExitCode -ne 0) { throw 'Cluster start failed.' };$editStarted=$true
 & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $editPort -U postgres roleeditverify
 if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
 & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $editRun -Port $editPort -DatabaseName roleeditverify
 if ($LASTEXITCODE -ne 0) { throw 'Migration chain failed.' }
 Assert-EditCluster
 & "$PostgresBin/psql.exe" @editArgs -f (Join-Path $PSScriptRoot 'local-db-group-channels.sql') *> (Join-Path $editRun 'role-edit.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun 'role-edit.log') -Tail 30;throw 'Deletion SQL failed.' }
 Invoke-EditSql 'prepare-race' @'
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
insert into group_test.pending values('owner-add',group_test.request(180,'add',3));
reset role;
select set_config('request.jwt.claim.sub',message_send_test.id(3)::text,false);
set role authenticated;
insert into group_test.pending values('admin-self',group_test.request(181,'add',3));
'@
 $writer=Start-EditWriter 'group_add_race' @"
set application_name='group_add_race';
begin;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select group_test.capture('race-owner',(select request from group_test.pending where name='owner-add'));
select pg_sleep(2);
commit;
"@
 Invoke-EditSql 'concurrent-self' @'
select set_config('request.jwt.claim.sub',message_send_test.id(3)::text,false);
set role authenticated;
select group_test.capture('race-admin-self',(select request from group_test.pending where name='admin-self'));
reset role;
do $$begin assert(select count(*)=1 from public.message_channel_members where channel_id=group_test.channel() and team_member_id=message_send_test.id(13)),'Concurrent add duplicated join';assert(select count(*)=1 from group_test.cases where name like 'race-%' and receipt->>'status'='applied'),'Race did not enforce absent-base CAS';end$$;
'@
 $writer.WaitForExit();if($writer.ExitCode -ne 0){throw 'Concurrent group writer failed.'}
 Invoke-EditSql 'selfjoin-leave-history' @'
select set_config('request.jwt.claim.sub',message_send_test.id(3)::text,false);
set role authenticated;
select group_test.capture('admin-leave',group_test.request(190,'leave',3));
select group_test.capture('admin-selfjoin',group_test.request(191,'add',3));
do $$declare saved record;begin select * into saved from group_test.cases where name='admin-leave';assert public.mobile_apply_group_channel(saved.request)=saved.receipt;assert exists(select 1 from public.message_channel_members where channel_id=group_test.channel() and team_member_id=message_send_test.id(13)),'Old leave removed new selfjoin';end$$;
reset role;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
insert into group_test.pending values('missing',group_test.request(192,'add',3));
reset role;
delete from public.message_channels where id=group_test.channel();
set role authenticated;
select group_test.capture('missing',(select request from group_test.pending where name='missing'));
do $$declare saved record;begin select * into saved from group_test.cases where name='create';assert public.mobile_apply_group_channel(saved.request)=saved.receipt;assert not exists(select 1 from public.message_channels where id=group_test.channel()),'Create history recreated deleted channel';end$$;
'@
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from group_test.cases"
 if ($LASTEXITCODE -ne 0) { throw 'Evidence export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'group-channels-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS atomic group create/add/remove/selfleave, absent/exactjoin CAS, retry nonrevival, manager selfjoin race, late rollback, current authority and deletion history.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}

