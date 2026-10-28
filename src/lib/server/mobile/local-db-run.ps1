param([string]$PostgresBin = 'C:/Program Files/PostgreSQL/18/bin')
$ErrorActionPreference = 'Stop'
$mobileCluster = Join-Path $env:TEMP ('mobile-api-pg-' + [guid]::NewGuid().ToString('N'))
$mobileListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$mobileListener.Start()
$mobilePort = $mobileListener.LocalEndpoint.Port
$mobileListener.Stop()
New-Item -ItemType Directory -Path $mobileCluster | Out-Null
Set-Content -LiteralPath (Join-Path $mobileCluster 'MOBILE-VERIFICATION-ONLY') -Value 'Disposable isolated mobile SQL verification cluster. No user data.'
$mobileDataDirectory = Join-Path $mobileCluster 'data'
$mobileStarted = $false
try {
  & "$PostgresBin/initdb.exe" -D $mobileDataDirectory -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $mobileCluster 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated cluster initialization failed.' }
  $mobileStart = Start-Process -FilePath "$PostgresBin/pg_ctl.exe" -ArgumentList @('-D', "`"$mobileDataDirectory`"", '-l', "`"$(Join-Path $mobileCluster 'server.log')`"", '-o', "`"-h 127.0.0.1 -p $mobilePort`"", '-w', 'start') -WindowStyle Hidden -PassThru
  $mobileStart.WaitForExit()
  if ($mobileStart.ExitCode -ne 0) { throw 'Isolated cluster start failed.' }
  $mobileStarted = $true
  & "$PostgresBin/createdb.exe" -h 127.0.0.1 -p $mobilePort -U postgres mobileverify
  if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed.' }
  & (Join-Path $PSScriptRoot 'local-db-apply.ps1') -ClusterDirectory $mobileCluster -Port $mobilePort
  foreach ($mobileCheck in @('check','entities','boundaries','limits-cascades','overrides-setlist-delete','assets')) {
    $mobileLog = Join-Path $mobileCluster "$mobileCheck.log"
    & "$PostgresBin/psql.exe" -h 127.0.0.1 -p $mobilePort -U postgres -d mobileverify -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot "local-db-$mobileCheck.sql") *> $mobileLog
    if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath $mobileLog -Tail 15; throw "SQL checks failed: $mobileCheck" }
    $mobileFailures = Select-String -LiteralPath $mobileLog -Pattern '\| FAIL\s+\|'
    if ($mobileFailures) { $mobileFailures | ForEach-Object { Write-Output $_.Line }; throw "Entity checks failed: $mobileCheck" }
    Write-Output "PASS $mobileCheck"
  }
  Write-Output "SQL/RLS verification passed in PostgreSQL18 on loopback port $mobilePort. Auth/storage/realtime scaffolding and pg_net stub were used; genuine Supabase integration remains unverified."
} finally {
  if ($mobileStarted) { & "$PostgresBin/pg_ctl.exe" -D $mobileDataDirectory -m fast -w stop *> (Join-Path $mobileCluster 'stop.log') }
  Write-Output "Evidence retained: $mobileCluster"
}
