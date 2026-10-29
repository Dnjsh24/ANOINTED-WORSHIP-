param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$editRun = Join-Path $env:TEMP ('custom-role-retirement-api-pg-' + [guid]::NewGuid().ToString('N'))
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
 & "$PostgresBin/psql.exe" @editArgs -f (Join-Path $PSScriptRoot 'local-db-custom-role-retirement.sql') *> (Join-Path $editRun 'role-edit.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun 'role-edit.log') -Tail 30;throw 'Deletion SQL failed.' }
 $writer=Start-EditWriter 'retirement-new-assignment-writer' @'
set application_name='retirement-new-assignment-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set local role authenticated;
insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id) values(custom_role_retirement_test.id(18),custom_role_retirement_test.team(),custom_role_retirement_test.id(11),'member','active',custom_role_retirement_test.id(43));
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'assignment-before-retirement' @'
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set role authenticated;
select custom_role_retirement_test.capture('concurrent-new-assignment-conflict',custom_role_retirement_test.request(600,43));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from custom_role_retirement_test.cases where name='concurrent-new-assignment-conflict') and exists(select 1 from public.team_members where id=custom_role_retirement_test.id(18) and custom_role_id=custom_role_retirement_test.id(43)) and exists(select 1 from public.custom_roles where id=custom_role_retirement_test.id(43)),'Concurrent new assignment was omitted or dropped';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'New assignment writer failed.' }
 $writer=Start-EditWriter 'retirement-parent-delete-writer' @'
set application_name='retirement-parent-delete-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set local role authenticated;
select custom_role_retirement_test.capture('concurrent-retirement-applied',custom_role_retirement_test.request(601,44));
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'retirement-before-new-assignment' @'
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
do $$declare denied boolean:=false;begin
 begin insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id) values(custom_role_retirement_test.id(19),custom_role_retirement_test.team(),custom_role_retirement_test.id(12),'member','active',custom_role_retirement_test.id(44));
 exception when foreign_key_violation then denied:=true;end;
 assert denied,'Assignment survived the retired FK parent';assert not exists(select 1 from public.team_members where id=custom_role_retirement_test.id(19)),'Failed assignment left a membership';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Retirement writer failed.' }
 $writer=Start-EditWriter 'retirement-website-edit-writer' @'
set application_name='retirement-website-edit-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set local role authenticated;
update public.custom_roles set permissions=array['events.manage'] where id=custom_role_retirement_test.id(45);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'website-edit-before-retirement' @'
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set role authenticated;
select custom_role_retirement_test.capture('concurrent-role-edit-conflict',custom_role_retirement_test.request(602,45));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from custom_role_retirement_test.cases where name='concurrent-role-edit-conflict') and (select permissions=array['events.manage'] from public.custom_roles where id=custom_role_retirement_test.id(45)),'Concurrent role edit lost';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Role edit writer failed.' }
 $writer=Start-EditWriter 'retirement-member-replace-writer' @'
set application_name='retirement-member-replace-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set local role authenticated;
delete from public.team_members where id=custom_role_retirement_test.id(17);
insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id) values(custom_role_retirement_test.id(17),custom_role_retirement_test.team(),custom_role_retirement_test.id(10),'media','active',custom_role_retirement_test.id(46));
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'member-replacement-before-retirement' @'
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set role authenticated;
select custom_role_retirement_test.capture('concurrent-member-replacement-conflict',custom_role_retirement_test.request(603,46));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from custom_role_retirement_test.cases where name='concurrent-member-replacement-conflict') and (select role='media' and custom_role_id=custom_role_retirement_test.id(46) from public.team_members where id=custom_role_retirement_test.id(17)),'Replacement member changed by stale retirement';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Member replacement writer failed.' }
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object('identity',identity,'request',request,'receipt',receipt) order by name) from custom_role_retirement_test.cases),'states',(select jsonb_agg(jsonb_build_object('identity',identity,'state',state) order by name) from custom_role_retirement_test.states))"
 if ($LASTEXITCODE -ne 0) { throw 'Contract export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'custom-role-retirement-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS bounded role retirement, before/after FK assignment races, role edit/member replacement races and atomic rollback.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}
