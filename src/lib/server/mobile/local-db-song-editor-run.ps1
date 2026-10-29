param([string]$PostgresBin='C:/Program Files/PostgreSQL/18/bin',[string]$ClusterDirectory='C:/Users/danje/AppData/Local/Temp/song-purge-api-pg-8eaf6ae6d5874fb699f6aa2be23aef3a')
$ErrorActionPreference='Stop'
$editorCluster=(Resolve-Path -LiteralPath $ClusterDirectory).Path
if(-not $editorCluster.StartsWith((Join-Path $env:TEMP 'song-purge-api-pg-')) -or -not (Test-Path -LiteralPath (Join-Path $editorCluster 'MOBILE-VERIFICATION-ONLY'))){throw 'Only the retained owned SQL127 loopback cluster may be used.'}
$editorData=Join-Path $editorCluster 'data'
if(Test-Path -LiteralPath (Join-Path $editorData 'postmaster.pid')){throw 'Owned cluster must be stopped before this fixture starts.'}
$editorListener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$editorListener.Start();$editorPort=$editorListener.LocalEndpoint.Port;$editorListener.Stop()
$editorArgs=@('-h','127.0.0.1','-p',"$editorPort",'-U','postgres','-d','roleeditverify','-v','ON_ERROR_STOP=1')
$editorRun=Join-Path $env:TEMP ('song-editor-api-pg-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $editorRun|Out-Null
$editorStarted=$false
$editorSchema='song_editor_'+[guid]::NewGuid().ToString('N').Substring(0,16)
$editorPrefix=[guid]::NewGuid().ToString('N').Substring(0,8)
$editorCode=(Get-Random -Minimum 10000 -Maximum 100000).ToString()
function Assert-EditorCluster {
 $actual=& "$PostgresBin/psql.exe" @editorArgs -Atc 'show data_directory'
 if($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $editorData).Path){throw 'Not the owned isolated SQL127 cluster.'}
}
try {
 $start=Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$editorData`"",'-l',"`"$(Join-Path $editorRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $editorPort`"",'-w','start') -WindowStyle Hidden -PassThru
 $start.WaitForExit();if($start.ExitCode -ne 0){throw 'Cluster start failed.'};$editorStarted=$true
 Assert-EditorCluster
 $applied=Join-Path $editorCluster '20261024040000_mobile_song_purges.sql'
 $current=Join-Path $PSScriptRoot '../../../../supabase/migrations/20261024040000_mobile_song_purges.sql'
 if((Get-Content -LiteralPath $applied -Raw).Trim() -ne (Get-Content -LiteralPath $current -Raw).Trim()){throw 'SQL127 source differs from the applied retained cluster.'}
 $fixture=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'local-db-song-editor.sql') -Raw).Replace('song_editor_test',$editorSchema).Replace('99700000-',$editorPrefix+'-').Replace('SE-61025','SE-'+$editorCode).Replace('SF-61025','SF-'+$editorCode)
 Set-Content -LiteralPath (Join-Path $editorRun 'fixture.sql') -Value $fixture
 & "$PostgresBin/psql.exe" @editorArgs -f (Join-Path $editorRun 'fixture.sql') *> (Join-Path $editorRun 'fixture.log')
 if($LASTEXITCODE -ne 0){Get-Content (Join-Path $editorRun 'fixture.log') -Tail 18;throw 'Song editor fixture failed.'}
 $writerSql=@"
set application_name='song_editor_nonce_race';
begin;
select set_config('request.jwt.claim.sub',$editorSchema.id(3)::text,false);
set role authenticated;
select $editorSchema.capture_proposal('concurrent-first',$editorSchema.proposal(304,($editorSchema.download()->>'revision')::bigint));
select pg_sleep(2);
commit;
"@
 Set-Content -LiteralPath (Join-Path $editorRun 'writer.sql') -Value $writerSql
 $writer=Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList ($editorArgs+@('-f',"`"$(Join-Path $editorRun 'writer.sql')`"")) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $editorRun 'writer.log') -RedirectStandardError (Join-Path $editorRun 'writer.err')
 $ready=$false
 for($attempt=0;$attempt -lt 40;$attempt++){$state=& "$PostgresBin/psql.exe" @editorArgs -Atc "select count(*) from pg_stat_activity where application_name='song_editor_nonce_race' and wait_event='PgSleep'";if($LASTEXITCODE -ne 0){throw 'Race observation failed.'};if($state.Trim() -eq '1'){$ready=$true;break};Start-Sleep -Milliseconds 100}
 if(-not $ready){throw 'Proposal race writer did not reach its transaction barrier.'}
 $readerSql=@'
select set_config('request.jwt.claim.sub',song_editor_test.id(3)::text,false);
set role authenticated;
select song_editor_test.capture_proposal('concurrent-second',song_editor_test.proposal(304,(song_editor_test.download()->>'revision')::bigint));
reset role;
do $$begin assert(select count(distinct receipt::text)=1 from song_editor_test.proposal_cases where name like 'concurrent-%'),'Concurrent proposal proof changed';assert(select count(*)=3 from public.shared_edit_requests where team_id=song_editor_test.team()),'Concurrent proposal duplicated row';assert song_editor_test.notification_count()=6,'Concurrent proposal duplicated reviewer notifications';end$$;
'@
 Set-Content -LiteralPath (Join-Path $editorRun 'reader.sql') -Value $readerSql.Replace('song_editor_test',$editorSchema)
 & "$PostgresBin/psql.exe" @editorArgs -f (Join-Path $editorRun 'reader.sql') *> (Join-Path $editorRun 'reader.log')
 if($LASTEXITCODE -ne 0){Get-Content (Join-Path $editorRun 'reader.log') -Tail 15;throw 'Concurrent proposal reader failed.'}
 $writer.WaitForExit();if($writer.ExitCode -ne 0){throw 'Concurrent proposal writer failed.'}
 $cases=& "$PostgresBin/psql.exe" @editorArgs -Atc "select jsonb_build_object('editors',(select jsonb_agg(context order by name) from $editorSchema.editor_cases),'proposals',(select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from $editorSchema.proposal_cases))"
 if($LASTEXITCODE -ne 0){throw 'Evidence export failed.'}
 Set-Content -LiteralPath (Join-Path $editorRun 'song-editor-contract-cases.json') -Value $cases -Encoding utf8
 Write-Output 'PASS existing SQL127 self RLS/override default-deny-grant/creator v1 edit and revocation-before-ledger; proposal pending/exact duplicate/stale/foreign/revoked/protected fields; reviewer notifications and published song retained. No migration applied.'
} finally {
 if($editorStarted){Assert-EditorCluster;& "$PostgresBin/pg_ctl.exe" -D $editorData -m fast -w stop *> (Join-Path $editorRun 'stop.log');if($LASTEXITCODE -ne 0){throw 'Cluster stop failed.'}}
 Write-Output "Evidence retained: $editorRun"
}
