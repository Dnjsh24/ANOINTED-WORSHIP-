param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$editRun = Join-Path $env:TEMP ('self-member-leave-api-pg-' + [guid]::NewGuid().ToString('N'))
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
 & "$PostgresBin/psql.exe" @editArgs -f (Join-Path $PSScriptRoot 'local-db-self-member-leave.sql') *> (Join-Path $editRun 'role-edit.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun 'role-edit.log') -Tail 30;throw 'Deletion SQL failed.' }
 $writer=Start-EditWriter 'self-leave-role-writer' @'
set application_name='self-leave-role-writer';
begin;
select set_config('request.jwt.claim.sub',self_leave_test.id(1)::text,false);
set local role authenticated;
update public.team_members set role='media' where id=self_leave_test.id(14);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'role-before-leave' @'
select set_config('request.jwt.claim.sub',self_leave_test.id(7)::text,false);
set role authenticated;
select self_leave_test.capture('concurrent-role-conflict',(select request from self_leave_test.pending where key='role-race'));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from self_leave_test.cases where name='concurrent-role-conflict') and (select role='media' from public.team_members where id=self_leave_test.id(14)),'Leave deleted changed role';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Role writer failed.' }
 $writer=Start-EditWriter 'self-leave-owner-writer' @'
set application_name='self-leave-owner-writer';
begin;
select set_config('request.jwt.claim.sub',self_leave_test.id(1)::text,false);
set local role authenticated;
select public.transfer_team_ownership(self_leave_test.team(),self_leave_test.id(15));
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'ownership-before-leave' @'
select set_config('request.jwt.claim.sub',self_leave_test.id(8)::text,false);
set role authenticated;
select self_leave_test.capture('concurrent-owner-promotion-conflict',(select request from self_leave_test.pending where key='owner-race'));
select self_leave_test.state('promoted-owner-conflict-proof',(select request from self_leave_test.pending where key='owner-race'));
do $$declare saved record;begin select * into saved from self_leave_test.cases where name='concurrent-owner-promotion-conflict';assert self_leave_test.rpc(saved.request)=saved.receipt,'Owner promotion conflict history unstable';end$$;
reset role;
do $$begin assert (select receipt->>'status'='conflict' from self_leave_test.cases where name='concurrent-owner-promotion-conflict') and (select owner_id=self_leave_test.id(8) from public.teams where id=self_leave_test.team()) and (select role='owner' from public.team_members where id=self_leave_test.id(15)),'Leave deleted promoted owner';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Owner writer failed.' }
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object('scope',scope,'request',request,'receipt',receipt) order by name) from self_leave_test.cases),'states',(select jsonb_agg(jsonb_build_object('scope',scope,'state',state) order by name) from self_leave_test.states))"
 if ($LASTEXITCODE -ne 0) { throw 'Contract export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'self-member-leave-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS self departure, sealed absence/replacement guard, FK blocked/rollback and role/owner races.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}
