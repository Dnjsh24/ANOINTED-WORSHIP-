param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$editRun = Join-Path $env:TEMP ('custom-role-edit-api-pg-' + [guid]::NewGuid().ToString('N'))
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
 & "$PostgresBin/psql.exe" @editArgs -f (Join-Path $PSScriptRoot 'local-db-custom-role-edit.sql') *> (Join-Path $editRun 'role-edit.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun 'role-edit.log') -Tail 30;throw 'Deletion SQL failed.' }
 $writer=Start-EditWriter 'role-edit-website-writer' @'
set application_name='role-edit-website-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
set local role authenticated;
insert into public.custom_roles(team_id,name,permissions) values(custom_role_edit_test.team(),'Concurrent destination',array['songs.create']);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'website-name-before-edit' @'
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
set role authenticated;
select custom_role_edit_test.capture('concurrent-website-name-blocked',custom_role_edit_test.request(240,custom_role_edit_test.base(43),'CONCURRENT DESTINATION'));
reset role;
do $$begin assert (select receipt->>'status'='blocked' from custom_role_edit_test.cases where name='concurrent-website-name-blocked') and (select count(*)=1 from public.custom_roles where team_id=custom_role_edit_test.team() and lower(name)='concurrent destination'),'Concurrent website name overwritten';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Website writer failed.' }
 $writer=Start-EditWriter 'role-edit-delete-writer' @'
set application_name='role-edit-delete-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
set local role authenticated;
select public.mobile_apply_custom_role_delete(custom_role_edit_test.team(),(select id from public.team_members where team_id=custom_role_edit_test.team() and profile_id=auth.uid()),custom_role_edit_test.request(241,custom_role_edit_test.base(44),'unused')-'value');
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'delete-before-edit' @'
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
set role authenticated;
select custom_role_edit_test.capture('concurrent-delete-missing',custom_role_edit_test.request(242,custom_role_edit_test.base(44),'Deleted role'));
reset role;
do $$begin assert (select receipt->>'status'='missing' from custom_role_edit_test.cases where name='concurrent-delete-missing') and not exists(select 1 from public.custom_roles where id=custom_role_edit_test.id(44)),'Edit revived concurrent deletion';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Deletion writer failed.' }
 $writer=Start-EditWriter 'role-edit-assignment-writer' @'
set application_name='role-edit-assignment-writer';
begin;
update public.team_members set custom_role_id=custom_role_edit_test.id(46) where id=custom_role_edit_test.id(10);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'assignment-before-edit' @'
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
set role authenticated;
select custom_role_edit_test.capture('concurrent-assignment-applied',custom_role_edit_test.request(243,custom_role_edit_test.base(46),'Race assignment','["events.manage"]'));
reset role;
do $$begin assert (select receipt->>'status'='applied' from custom_role_edit_test.cases where name='concurrent-assignment-applied') and (select custom_role_id=custom_role_edit_test.id(46) from public.team_members where id=custom_role_edit_test.id(10)) and (select permissions=array['events.manage'] from public.custom_roles where id=custom_role_edit_test.id(46)),'Concurrent assignment or edit lost';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Assignment writer failed.' }
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from custom_role_edit_test.cases),'catalogRow',(select value from custom_role_edit_test.catalog_snapshot))"
 if ($LASTEXITCODE -ne 0) { throw 'Contract export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'custom-role-edit-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS role editing, website name/deletion/assignment races, CAS, immutable retries and late rollback.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}
