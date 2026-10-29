param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$editRun = Join-Path $env:TEMP ('role-permission-override-api-pg-' + [guid]::NewGuid().ToString('N'))
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
 & "$PostgresBin/psql.exe" @editArgs -f (Join-Path $PSScriptRoot 'local-db-role-permission-override.sql') *> (Join-Path $editRun 'role-edit.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $editRun 'role-edit.log') -Tail 30;throw 'Deletion SQL failed.' }
 $writer=Start-EditWriter 'role-override-website-writer' @'
set application_name='role-override-website-writer';
begin;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
set local role authenticated;
select public.set_team_permission_override(role_permission_override_test.team(),'pastor',null,'team.manage',true);
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'website-before-override' @'
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
set role authenticated;
select role_permission_override_test.capture('concurrent-website-conflict',role_permission_override_test.request(600,'pastor','team.manage','deny'));
reset role;
do $$begin assert (select receipt->>'status'='conflict' from role_permission_override_test.cases where name='concurrent-website-conflict') and (select allowed from public.team_permission_overrides where team_id=role_permission_override_test.team() and role='pastor' and permission='team.manage'),'Native overwrite lost website permission';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Website override writer failed.' }
 $writer=Start-EditWriter 'role-override-owner-transfer-writer' @'
set application_name='role-override-owner-transfer-writer';
begin;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
set local role authenticated;
select public.transfer_team_ownership(role_permission_override_test.team(),role_permission_override_test.id(11));
select pg_sleep(2);
commit;
'@
 Invoke-EditSql 'ownership-before-override' @'
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
set role authenticated;
select role_permission_override_test.denied(role_permission_override_test.request(601,'pastor','team.manage','deny'),'42501');
reset role;
do $$begin assert (select allowed from public.team_permission_overrides where team_id=role_permission_override_test.team() and role='pastor' and permission='team.manage'),'Old owner changed permissions after transfer';end$$;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(4)::text,false);
set role authenticated;
select role_permission_override_test.capture_state('transferred-owner-safe','pastor','team.manage');
reset role;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Ownership writer failed.' }
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object('identity',identity,'request',request,'receipt',receipt) order by name) from role_permission_override_test.cases),'states',(select jsonb_agg(jsonb_build_object('identity',identity,'state',state) order by name) from role_permission_override_test.states),'personRows',(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o where member_id is not null))"
 if ($LASTEXITCODE -ne 0) { throw 'Contract export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'role-permission-override-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS canonical-owner role overrides, person precedence, website/ownership races, immutable retries and atomic audit rollback.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}
