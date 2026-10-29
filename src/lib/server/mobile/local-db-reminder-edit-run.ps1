param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$reminderRun = Join-Path $env:TEMP ('reminder-api-pg-' + [guid]::NewGuid().ToString('N'))
$reminderListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$reminderListener.Start(); $reminderPort = $reminderListener.LocalEndpoint.Port; $reminderListener.Stop()
New-Item -ItemType Directory -Path $reminderRun | Out-Null
Set-Content -LiteralPath (Join-Path $reminderRun 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable loopback Reminder verification only. No remote data.'
$reminderData = Join-Path $reminderRun 'data'
$reminderArgs = @('-h','127.0.0.1','-p',"$reminderPort",'-U','postgres','-d','reminderverify','-v','ON_ERROR_STOP=1')
$reminderStarted = $false
function Assert-ReminderCluster {
  $actual = & "$PostgresBin/psql.exe" @reminderArgs -Atc 'show data_directory'
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $reminderRun 'MOBILE-VERIFICATION-ONLY')) -or (Resolve-Path -LiteralPath $actual.Trim()).Path -ne (Resolve-Path -LiteralPath $reminderData).Path) { throw 'Not the owned isolated Reminder cluster.' }
}
try {
  & "$PostgresBin/initdb.exe" -D $reminderData -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $reminderRun 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $reminderStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D',"`"$reminderData`"",'-l',"`"$(Join-Path $reminderRun 'server.log')`"",'-o',"`"-h 127.0.0.1 -p $reminderPort`"",'-w','start') -WindowStyle Hidden -PassThru
  $reminderStart.WaitForExit(); if ($reminderStart.ExitCode -ne 0) { throw 'Cluster start failed.' }; $reminderStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $reminderPort -U postgres reminderverify
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $reminderRun -Port $reminderPort -DatabaseName reminderverify
  if ($LASTEXITCODE -ne 0) { throw 'Reminder migration chain failed; fixture execution is stopped.' }
  Assert-ReminderCluster
  & "$PostgresBin/psql.exe" @reminderArgs -f (Join-Path $PSScriptRoot 'local-db-reminder-edit.sql') *> (Join-Path $reminderRun 'reminder.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $reminderRun 'reminder.log') -Tail 30; throw 'Reminder SQL verification failed.' }
  $cases = & "$PostgresBin/psql.exe" @reminderArgs -Atc "select jsonb_agg(jsonb_build_object('request',request,'receipt',receipt) order by name) from reminder_edit_test.cases"
  if ($LASTEXITCODE -ne 0) { throw 'Reminder contract export failed.' }
  Set-Content -LiteralPath (Join-Path $reminderRun 'reminder-contract-cases.json') -Value $cases -Encoding utf8
  $pages = & "$PostgresBin/psql.exe" @reminderArgs -Atc "select jsonb_agg(jsonb_build_object('identity',identity,'page',page)) from reminder_edit_test.pages"
  if ($LASTEXITCODE -ne 0) { throw 'Management contract export failed.' }
  Set-Content -LiteralPath (Join-Path $reminderRun 'reminder-management-pages.json') -Value $pages -Encoding utf8
  Write-Output 'PASS reminder recurring creation, content edit, whole-group deletion, manager reads, Manila schedules, CAS, immutable receipts and rollback.'
} finally {
  if ($reminderStarted) {
    Assert-ReminderCluster
    & "$PostgresBin/pg_ctl.exe" -D $reminderData -m fast -w stop *> (Join-Path $reminderRun 'stop.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster stop failed.' }
  }
  Write-Output "Evidence retained: $reminderRun"
}


