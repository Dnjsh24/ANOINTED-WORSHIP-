param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin',[string]$ResumeDirectory='',[int]$FixtureStartLine=1)
$ErrorActionPreference = 'Stop'
$editRun = if($ResumeDirectory){(Resolve-Path -LiteralPath $ResumeDirectory).Path}else{Join-Path $env:TEMP ('song-purge-api-pg-' + [guid]::NewGuid().ToString('N'))}
if($ResumeDirectory -and (-not (Test-Path -LiteralPath (Join-Path $editRun 'MOBILE-VERIFICATION-ONLY')) -or -not $editRun.StartsWith((Join-Path $env:TEMP 'song-purge-api-pg-')))){throw 'Resume requires this harness owned temporary cluster.'}
$editListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$editListener.Start(); $editPort = $editListener.LocalEndpoint.Port; $editListener.Stop()
if(-not $ResumeDirectory){New-Item -ItemType Directory -Path $editRun | Out-Null}
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
 if(-not $ResumeDirectory){
  & "$PostgresBin/initdb.exe" -D $editData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $editRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
 }
 $start=Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$editData`"",'-l',"`"$(Join-Path $editRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $editPort`"",'-w','start') -WindowStyle Hidden -PassThru
 $start.WaitForExit();if ($start.ExitCode -ne 0) { throw 'Cluster start failed.' };$editStarted=$true
 if(-not $ResumeDirectory){
 & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $editPort -U postgres roleeditverify
 if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
 & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $editRun -Port $editPort -DatabaseName roleeditverify
 if ($LASTEXITCODE -ne 0) { throw 'Migration chain failed.' }
 }
 Assert-EditCluster
 $fixture=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-db-song-purge.sql')
 Invoke-EditSql 'purge-fixture' (($fixture|Select-Object -Skip ($FixtureStartLine-1))-join "`n")
 $writer=Start-EditWriter 'song_purge_nonce_race' @"
set application_name='song_purge_nonce_race';
begin;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select song_purge_test.capture('concurrent-first',(select request from song_purge_test.pending where name='concurrent'));
select pg_sleep(2);
commit;
"@
 Invoke-EditSql 'concurrent-second' @'
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select song_purge_test.capture('concurrent-second',(select request from song_purge_test.pending where name='concurrent'));
reset role;
do $$begin assert(select count(distinct receipt::text)=1 from song_purge_test.cases where name like 'concurrent-%'),'Concurrent retry changed receipt';assert not exists(select 1 from public.songs where id=message_send_test.id(1007)),'Concurrent purge did not apply';end$$;
'@
 $writer.WaitForExit();if($writer.ExitCode -ne 0){throw 'Concurrent purge writer failed.'}
 # Real restore/link/retrash guards predict the final revision, isolating parent
 # discovery and complete impact from merely stale song revision detection.
 Invoke-EditSql 'prepare-link-race' @'
update song_purge_test.pending set request=jsonb_set(request,'{base,revision}',to_jsonb((request#>>'{base,revision}')::bigint+2)) where name='race';
'@
 $writer=Start-EditWriter 'song_purge_link_race' @"
set application_name='song_purge_link_race';
begin;
select set_config('request.jwt.claim.sub','',false);
update public.songs set deleted_at=null where id=message_send_test.id(1009);
insert into public.setlist_songs(id,setlist_id,song_id,song_order,assigned_key) values(message_send_test.id(4600),message_send_test.id(3000),message_send_test.id(1009),1,'C');
update public.songs set deleted_at='2026-10-24T04:05:06.654321Z' where id=message_send_test.id(1009);
select pg_sleep(2);
commit;
"@
 Invoke-EditSql 'link-race-reader' @'
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select song_purge_test.capture('new-link-race',(select request from song_purge_test.pending where name='race'));
reset role;
do $$begin assert(select receipt->>'status'='conflict' from song_purge_test.cases where name='new-link-race');assert exists(select 1 from public.setlist_songs where id=message_send_test.id(4600)),'New link deleted';assert(select s.sync_revision=(p.request#>>'{base,revision}')::bigint from public.songs s cross join song_purge_test.pending p where s.id=message_send_test.id(1009) and p.name='race'),'Race did not isolate parent/impact';end$$;
'@
 $writer.WaitForExit();if($writer.ExitCode -ne 0){throw 'New-link writer failed.'}
 $writer=Start-EditWriter 'song_purge_child_race' @"
set application_name='song_purge_child_race';
begin;
select set_config('request.jwt.claim.sub','',false);
select id from public.songs where id=message_send_test.id(1014) for update;
update public.setlist_songs set notes='Committed while purge waits' where song_id=message_send_test.id(1014);
select pg_sleep(2);
commit;
"@
 Invoke-EditSql 'child-race-reader' @'
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select song_purge_test.capture('child-edit-race',(select request from song_purge_test.pending where name='child-race'));
reset role;
do $$begin assert(select receipt->>'status'='conflict' from song_purge_test.cases where name='child-edit-race');assert exists(select 1 from public.setlist_songs where song_id=message_send_test.id(1014) and notes='Committed while purge waits');end$$;
'@
 $writer.WaitForExit();if($writer.ExitCode -ne 0){throw 'Child-edit writer failed.'}
 $cases=& "$PostgresBin/psql.exe" @editArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from song_purge_test.cases"
 if ($LASTEXITCODE -ne 0) { throw 'Evidence export failed.' }
 Set-Content -LiteralPath (Join-Path $editRun 'song-purge-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS Trash-only base/complete impact CAS; authority before exact concurrent history; UUID replacement; child and late ledger rollback; FK cascade/nulling; retained Storage; parent/child races; bounded/foreign impact.'
} finally {
 if ($editStarted) {
  Assert-EditCluster
  & "$PostgresBin/pg_ctl.exe" -D $editData -m fast -w stop *> (Join-Path $editRun 'stop.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster stop failed.' }
 }
 Write-Output "Evidence retained: $editRun"
}
