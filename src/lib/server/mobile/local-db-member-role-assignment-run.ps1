param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$editRun = Join-Path $env:TEMP ('member-role-assignment-api-pg-' + [guid]::NewGuid().ToString('N'))
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
 & "$PostgresBin/psql.exe" @editArgs -f (Join-Path $PSScriptRoot 'local-db-member-role-assignment.sql') *> (Join-Path $editRun 'role-edit.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun 'role-edit.log') -Tail 30;throw 'Deletion SQL failed.' }
 $writer=Start-EditWriter 'member-assignment-website-writer' @'
set application_name='member-assignment-website-writer';
begin;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set local role authenticated;
update public.team_members set role='media',custom_role_id=null where id=member_role_assignment_test.id(25);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'website-assignment-before-mobile' @'
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set role authenticated;
select member_role_assignment_test.capture('concurrent-website-assignment-conflict',member_role_assignment_test.request(600,25,'band_leader'));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from member_role_assignment_test.cases where name='concurrent-website-assignment-conflict') and (select role='media' from public.team_members where id=member_role_assignment_test.id(25)),'Concurrent website assignment overwritten';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Website membership writer failed.' }
 $writer=Start-EditWriter 'member-assignment-role-edit-writer' @'
set application_name='member-assignment-role-edit-writer';
begin;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set local role authenticated;
update public.custom_roles set permissions=array['songs.edit'] where id=member_role_assignment_test.id(33);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'custom-edit-before-mobile' @'
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set role authenticated;
select member_role_assignment_test.capture('concurrent-custom-edit-blocked',member_role_assignment_test.request(601,26,'member',member_role_assignment_test.custom(33)));
reset role;
do $$begin assert (select receipt->>'reason'='custom_role_changed' from member_role_assignment_test.cases where name='concurrent-custom-edit-blocked') and (select custom_role_id is null from public.team_members where id=member_role_assignment_test.id(26)),'Changed custom role assigned';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Custom-role writer failed.' }
 $writer=Start-EditWriter 'member-assignment-member-delete-writer' @'
set application_name='member-assignment-member-delete-writer';
begin;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set local role authenticated;
delete from public.team_members where id=member_role_assignment_test.id(27);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'target-delete-before-mobile' @'
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set role authenticated;
select member_role_assignment_test.capture('concurrent-target-delete-missing',member_role_assignment_test.request(602,27,'pastor'));
reset role;
do $$begin assert (select receipt->>'status'='missing' from member_role_assignment_test.cases where name='concurrent-target-delete-missing') and not exists(select 1 from public.team_members where id=member_role_assignment_test.id(27)),'Assignment revived deleted target';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Member deletion writer failed.' }
 $writer=Start-EditWriter 'member-assignment-role-delete-writer' @'
set application_name='member-assignment-role-delete-writer';
begin;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set local role authenticated;
select public.mobile_apply_custom_role_delete(member_role_assignment_test.team(),(member_role_assignment_test.identity()->>'memberId')::uuid,jsonb_build_object('version',2,'userId',auth.uid(),'teamId',member_role_assignment_test.team(),'memberId',member_role_assignment_test.identity()->'memberId','requestNonce',member_role_assignment_test.id(603),'base',member_role_assignment_test.custom(34)));
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'custom-delete-before-mobile' @'
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
set role authenticated;
select member_role_assignment_test.capture('concurrent-custom-delete-blocked',member_role_assignment_test.request(604,28,'member',member_role_assignment_test.custom(34)));
reset role;
do $$begin assert (select receipt->>'reason'='custom_role_missing' from member_role_assignment_test.cases where name='concurrent-custom-delete-blocked') and (select custom_role_id is null from public.team_members where id=member_role_assignment_test.id(28)),'Deleted custom role assigned';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Custom-role deletion writer failed.' }
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object('identity',identity,'request',request,'receipt',receipt) order by name) from member_role_assignment_test.cases),'states',(select jsonb_agg(jsonb_build_object('identity',identity,'state',state) order by name) from member_role_assignment_test.states))"
 if ($LASTEXITCODE -ne 0) { throw 'Contract export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'member-role-assignment-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS other-member role assignment, membership/custom-role races, CAS, immutable retries and late rollback.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}
