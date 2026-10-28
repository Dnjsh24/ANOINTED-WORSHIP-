param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$editRun = Join-Path $env:TEMP ('ownership-transfer-api-pg-' + [guid]::NewGuid().ToString('N'))
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
 & "$PostgresBin/psql.exe" @editArgs -f (Join-Path $PSScriptRoot 'local-db-ownership-transfer.sql') *> (Join-Path $editRun 'role-edit.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun 'role-edit.log') -Tail 30;throw 'Deletion SQL failed.' }
 $writer=Start-EditWriter 'ownership-target-edit-writer' @'
set application_name='ownership-target-edit-writer';
begin;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
set local role authenticated;
update public.team_members set role='media',custom_role_id=null where id=ownership_transfer_test.id(21);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'target-edit-before-transfer' @'
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
set role authenticated;
select ownership_transfer_test.capture('concurrent-target-edit-conflict',ownership_transfer_test.request(600,21));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from ownership_transfer_test.cases where name='concurrent-target-edit-conflict') and (select role='media' from public.team_members where id=ownership_transfer_test.id(21)),'Ownership transfer overwrote target edit';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Target edit writer failed.' }
 $writer=Start-EditWriter 'ownership-target-delete-writer' @'
set application_name='ownership-target-delete-writer';
begin;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
set local role authenticated;
delete from public.team_members where id=ownership_transfer_test.id(24);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'target-delete-before-transfer' @'
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
set role authenticated;
select ownership_transfer_test.capture('concurrent-target-delete-missing',ownership_transfer_test.request(601,24));
reset role;
do $$begin assert (select receipt->>'status'='missing' from ownership_transfer_test.cases where name='concurrent-target-delete-missing') and not exists(select 1 from public.team_members where id=ownership_transfer_test.id(24)),'Ownership transfer revived deleted target';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Target deletion writer failed.' }
 Invoke-EditSql 'prepare-second-transfer-intent' @'
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
insert into ownership_transfer_test.pending values('second-transfer',ownership_transfer_test.request(602,25));
'@
 $writer=Start-EditWriter 'ownership-second-transfer-writer' @'
set application_name='ownership-second-transfer-writer';
begin;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
set local role authenticated;
select public.transfer_team_ownership(ownership_transfer_test.team(),ownership_transfer_test.id(23));
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'second-transfer-before-stale-request' @'
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
set role authenticated;
select ownership_transfer_test.denied((select request from ownership_transfer_test.pending where key='second-transfer'),'42501');
reset role;
do $$begin assert (select owner_id=ownership_transfer_test.id(9) from public.teams where id=ownership_transfer_test.team()) and (select role='owner' from public.team_members where id=ownership_transfer_test.id(23)),'Stale second transfer changed canonical owner';end$$;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(1)::text,false);
set role authenticated;
select ownership_transfer_test.denied((select request from ownership_transfer_test.pending where key='applied'),'42501');
select ownership_transfer_test.denied_state(20,520,'42501');
reset role;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Second ownership transfer writer failed.' }
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object('identity',identity,'freshIdentity',fresh_identity,'request',request,'receipt',receipt) order by name) from ownership_transfer_test.cases),'states',(select jsonb_agg(jsonb_build_object('identity',identity,'state',state) order by name) from ownership_transfer_test.states))"
 if ($LASTEXITCODE -ne 0) { throw 'Contract export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'ownership-transfer-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS ownership transfer, sealed demoted recovery, target edit/deletion/second-transfer races and atomic rollback.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}
