param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$deleteRun = Join-Path $env:TEMP ('custom-role-delete-api-pg-' + [guid]::NewGuid().ToString('N'))
$deleteListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$deleteListener.Start(); $deletePort = $deleteListener.LocalEndpoint.Port; $deleteListener.Stop()
New-Item -ItemType Directory -Path $deleteRun | Out-Null
Set-Content -LiteralPath (Join-Path $deleteRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback role deletion verification only.'
$deleteData = Join-Path $deleteRun 'data'
$deleteArgs = @('-h','127.0.0.1','-p',"$deletePort",'-U','postgres','-d','roledeleteverify','-v','ON_ERROR_STOP=1')
$deleteStarted = $false
function Assert-DeleteCluster {
 $actual = & "$PostgresBin/psql.exe" @deleteArgs -Atc 'show data_directory'
 if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $deleteRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $deleteData).Path) { throw 'Not the owned isolated deletion cluster.' }
}
function Invoke-DeleteSql([string]$Name,[string]$Sql) {
 $file = Join-Path $deleteRun ($Name + '.sql')
 Set-Content -LiteralPath $file -Value $Sql
 & "$PostgresBin/psql.exe" @deleteArgs -f $file *> (Join-Path $deleteRun ($Name + '.log'))
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $deleteRun ($Name + '.log')) -Tail 25; throw "SQL failed: $Name" }
}
function Start-DeleteWriter([string]$Name,[string]$Sql) {
 $file=Join-Path $deleteRun ($Name+'.sql');Set-Content -LiteralPath $file -Value $Sql
 $writer=Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($deleteArgs+@('-f',"`"$file`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $deleteRun ($Name+'.log')) -RedirectStandardError (Join-Path $deleteRun ($Name+'.err'))
 $ready=$false
 for ($attempt=0;$attempt -lt 50;$attempt++) {
  $state=& "$PostgresBin/psql.exe" @deleteArgs -Atc "select count(*) from pg_stat_activity where application_name='$Name' and wait_event='PgSleep'"
  if ($LASTEXITCODE -ne 0) { throw 'Race barrier observation failed.' }
  if ($state.Trim() -eq '1') { $ready=$true;break };Start-Sleep -Milliseconds 100
 }
 if (-not $ready) { throw "Writer did not reach transaction barrier: $Name" }
 return $writer
}
try {
 & "$PostgresBin/initdb.exe" -D $deleteData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $deleteRun 'initdb.log')
 if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
 $start=Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$deleteData`"",'-l',"`"$(Join-Path $deleteRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $deletePort`"",'-w','start') -WindowStyle Hidden -PassThru
 $start.WaitForExit();if ($start.ExitCode -ne 0) { throw 'Cluster start failed.' };$deleteStarted=$true
 & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $deletePort -U postgres roledeleteverify
 if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
 & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $deleteRun -Port $deletePort -DatabaseName roledeleteverify
 if ($LASTEXITCODE -ne 0) { throw 'Migration chain failed.' }
 Assert-DeleteCluster
 & "$PostgresBin/psql.exe" @deleteArgs -f (Join-Path $PSScriptRoot 'local-db-custom-role-delete.sql') *> (Join-Path $deleteRun 'role-delete.log')
 if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $deleteRun 'role-delete.log') -Tail 30;throw 'Deletion SQL failed.' }
 $writer=Start-DeleteWriter 'role-delete-assignment-writer' @'
set application_name='role-delete-assignment-writer';
begin;
update public.team_members set custom_role_id=custom_role_delete_test.id(43) where id=custom_role_delete_test.id(10);
select pg_sleep(2);
commit;
'@
 Invoke-DeleteSql 'assignment-before-delete' @'
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
set role authenticated;
select custom_role_delete_test.capture('concurrent-assignment-blocked',custom_role_delete_test.request(240,custom_role_delete_test.base(43)));
reset role;
do $$begin assert (select receipt->>'status'='blocked' from custom_role_delete_test.cases where name='concurrent-assignment-blocked') and (select custom_role_id=custom_role_delete_test.id(43) from public.team_members where id=custom_role_delete_test.id(10)),'Concurrent assignment lost';end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Assignment writer failed.' }
 $writer=Start-DeleteWriter 'role-delete-writer' @'
set application_name='role-delete-writer';
begin;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
set local role authenticated;
select custom_role_delete_test.capture('concurrent-delete-applied',custom_role_delete_test.request(241,custom_role_delete_test.base(44)));
select pg_sleep(2);
commit;
'@
 Invoke-DeleteSql 'delete-before-assignment' @'
do $$declare denied boolean:=false;begin
 begin insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id) values(custom_role_delete_test.id(99),custom_role_delete_test.team(),custom_role_delete_test.id(2),'member','active',custom_role_delete_test.id(44));
 exception when foreign_key_violation then denied:=true;end;
 assert denied,'Assignment survived deleted role';
 assert not exists(select 1 from public.custom_roles where id=custom_role_delete_test.id(44)),'Deletion failed';
end$$;
'@
 if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Deletion writer failed.' }
 $cases=& "$PostgresBin/psql.exe" @deleteArgs -Atc "select jsonb_build_object('cases',(select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from custom_role_delete_test.cases),'catalogRow',(select value from custom_role_delete_test.catalog_snapshot))"
 if ($LASTEXITCODE -ne 0) { throw 'Contract export failed.' }
 Set-Content -LiteralPath (Join-Path $deleteRun 'custom-role-delete-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS unused-role deletion, both assignment races, CAS, immutable retries and late rollback.'
} finally {
 if ($deleteStarted) {
  Assert-DeleteCluster
  & "$PostgresBin/pg_ctl.exe" -D $deleteData -m fast -w stop *> (Join-Path $deleteRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $deleteRun"
}
