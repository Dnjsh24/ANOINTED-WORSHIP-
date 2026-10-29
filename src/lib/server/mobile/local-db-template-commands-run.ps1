param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$templateRun = Join-Path $env:TEMP ('mobile-template-pg-' + [guid]::NewGuid().ToString('N'))
$templateListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$templateListener.Start(); $templatePort = $templateListener.LocalEndpoint.Port; $templateListener.Stop()
New-Item -ItemType Directory -Path $templateRun | Out-Null
Set-Content -LiteralPath (Join-Path $templateRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback template SQL cluster. Synthetic accounts; no remote data.'
$templateData = Join-Path $templateRun 'data'
$templateRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$templateArgs = @('-h','127.0.0.1','-p',"$templatePort",'-U','postgres','-d','templateverify','-v','ON_ERROR_STOP=1')
$templateStarted = $false
function Assert-TemplateCluster {
  if (-not (Test-Path -LiteralPath (Join-Path $templateRun 'MOBILE-VERIFICATION-ONLY'))) { throw 'Missing isolated-cluster marker.' }
  $actualData = & "$PostgresBin/psql.exe" @templateArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $actualData.Trim()).Path -ne (Resolve-Path -LiteralPath $templateData).Path) { throw 'Database is not the owned disposable cluster.' }
}
function Invoke-TemplateSql([string]$File,[string]$Log) {
  Assert-TemplateCluster
  & "$PostgresBin/psql.exe" @templateArgs -f $File *> (Join-Path $templateRun $Log)
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $templateRun $Log) -Tail 30; throw "SQL verification failed: $Log" }
}
try {
  & "$PostgresBin/initdb.exe" -D $templateData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $templateRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
  $templateStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$templateData`"",'-l',"`"$(Join-Path $templateRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $templatePort`"",'-w','start') -WindowStyle Hidden -PassThru
  $templateStart.WaitForExit(); if ($templateStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $templateStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $templatePort -U postgres templateverify
  if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed.' }
  Invoke-TemplateSql (Join-Path $PSScriptRoot 'local-db-bootstrap.sql') 'bootstrap.log'
  $templateMigrations = Get-ChildItem (Join-Path $templateRoot 'supabase/migrations/*.sql') | Sort-Object Name
  foreach ($migration in $templateMigrations) {
    $sql = (Get-Content -Raw -LiteralPath $migration.FullName) -replace '(?im)^create extension if not exists pg_net with schema extensions;','-- Disposable verification: no-network pg_net stub.'
    $copy = Join-Path $templateRun $migration.Name
    Set-Content -LiteralPath $copy -Value $sql -Encoding utf8
    Invoke-TemplateSql $copy ($migration.Name + '.log')
  }
  Invoke-TemplateSql (Join-Path $PSScriptRoot 'local-db-template-commands.sql') 'template-commands.log'
  Write-Output "PASS template SQL fixture; $($templateMigrations.Count) fresh migrations."
  $templateWriters = @()
  foreach ($label in @('first','second')) {
    $raceFile = Join-Path $templateRun "concurrent-$label.sql"
    Set-Content -LiteralPath $raceFile -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
begin;
set local statement_timeout='15s';
select set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
set local role authenticated;
insert into template_test.race_results(value) select public.mobile_apply_template_commands(
 (select id from template_test.ids where key='teamA'),
 (select id from public.team_members where profile_id=auth.uid() and team_id=(select id from template_test.ids where key='teamA')),
 jsonb_build_array((select command from template_test.race)));
select pg_sleep(0.2);
commit;
'@
    $writerArgs = @('-h','127.0.0.1','-p',"$templatePort",'-U','postgres','-d','templateverify','-v','ON_ERROR_STOP=1','-f',"`"$raceFile`"")
    $templateWriters += Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList $writerArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $templateRun "concurrent-$label.out") -RedirectStandardError (Join-Path $templateRun "concurrent-$label.err")
  }
  foreach ($writer in $templateWriters) { $writer.WaitForExit(); if ($writer.ExitCode -ne 0) { throw 'Concurrent template retry failed; see retained logs.' } }
  $raceCheck = Join-Path $templateRun 'concurrent-check.sql'
  Set-Content -LiteralPath $raceCheck -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
do $$begin
 assert (select count(*)=2 and count(distinct value)=1 and bool_and(value->0->>'status'='applied') from template_test.race_results),'concurrent exact retries differ';
 assert (select count(*)=1 from public.mobile_setlist_command_receipts where command_id=template_test.id(190)),'duplicate receipts';
 assert (select count(*)=1 from public.setlist_templates where id=template_test.id(1190)),'duplicate templates';
 raise notice 'PASS concurrent exact create retries commit once and return identical receipts';
end$$;
'@
  Invoke-TemplateSql $raceCheck 'concurrent-check.log'
  # Competing commands target the same stable template identity; one must conflict.
  $templateWriters = @()
  foreach ($number in @(193,194)) {
    $raceFile = Join-Path $templateRun "competing-$number.sql"
    $raceSql = (Get-Content -Raw -LiteralPath (Join-Path $templateRun 'concurrent-first.sql')).Replace(
      'jsonb_build_array((select command from template_test.race))',
      "jsonb_build_array((select command from template_test.race)||jsonb_build_object('commandId',template_test.id($number),'templateId',template_test.id(1192)))")
    Set-Content -LiteralPath $raceFile -Encoding utf8 -Value $raceSql
    $writerArgs = @('-h','127.0.0.1','-p',"$templatePort",'-U','postgres','-d','templateverify','-v','ON_ERROR_STOP=1','-f',"`"$raceFile`"")
    $templateWriters += Start-Process -FilePath "$PostgresBin/psql.exe" -ArgumentList $writerArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $templateRun "competing-$number.out") -RedirectStandardError (Join-Path $templateRun "competing-$number.err")
  }
  foreach ($writer in $templateWriters) { $writer.WaitForExit(); if ($writer.ExitCode -ne 0) { throw 'Competing template command failed; see retained logs.' } }
  $raceCheck = Join-Path $templateRun 'competing-check.sql'
  Set-Content -LiteralPath $raceCheck -Encoding utf8 -Value @'
\set ON_ERROR_STOP on
do $$begin
 assert (select count(*)=1 from template_test.race_results where value->0->>'status'='conflict'),'competing identity did not conflict';
 assert (select count(*)=1 from public.setlist_templates where id=template_test.id(1192)),'competing identity overwrote or duplicated';
 assert (select count(*)=2 from public.mobile_setlist_command_receipts where command_id in(template_test.id(193),template_test.id(194))),'competing receipts missing';
 raise notice 'PASS competing stable target identity serializes to one create and one conflict';
end$$;
'@
  Invoke-TemplateSql $raceCheck 'competing-check.log'
  Assert-TemplateCluster
  $cases = & "$PostgresBin/psql.exe" @templateArgs -Atc "select jsonb_agg(jsonb_build_object('identity',identity,'command',command,'result',result) order by name) from template_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'Template SQL result export failed.' }
  Set-Content -LiteralPath (Join-Path $templateRun 'template-contract-cases.json') -Value $cases -Encoding utf8
  Write-Output 'PASS exact bases, role/RLS boundaries, historical replay after role loss, revocation, two tenants, anonymous, dependency/collision/concurrent retry checks.'
} finally {
  if ($templateStarted) {
    Assert-TemplateCluster
    & "$PostgresBin/pg_ctl.exe" -D $templateData -m fast -w stop *> (Join-Path $templateRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Disposable cluster stop failed.' }
    & "$PostgresBin/pg_ctl.exe" -D $templateData status *> (Join-Path $templateRun 'final-status.log')
    if ($LASTEXITCODE -ne 3) { throw 'Disposable cluster is not stopped.' }
  }
  Write-Output "Evidence retained: $templateRun"
}
exit 0
