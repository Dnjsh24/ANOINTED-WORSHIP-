param([Parameter(Mandatory)][string]$ClusterDirectory,[Parameter(Mandatory)][int]$Port,[string]$DatabaseName = 'mobileverify')
$ErrorActionPreference = 'Stop'
$mobilePgBin = 'C:/Program Files/PostgreSQL/18/bin'
$mobilePgArgs = @('-h','127.0.0.1','-p',"$Port",'-U','postgres','-d',$DatabaseName,'-v','ON_ERROR_STOP=1')
$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$mobileRunPath = (Resolve-Path -LiteralPath $ClusterDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $mobileRunPath 'MOBILE-VERIFICATION-ONLY'))) { throw 'Refusing to migrate a database without the isolated-cluster marker.' }
$mobileActualData = & "$mobilePgBin/psql.exe" @mobilePgArgs -Atc 'show data_directory'
if ($LASTEXITCODE -ne 0 -or (Resolve-Path -LiteralPath $mobileActualData.Trim()).Path -ne (Resolve-Path -LiteralPath (Join-Path $mobileRunPath 'data')).Path) { throw 'Connected database does not belong to this isolated cluster.' }
& "$mobilePgBin/psql.exe" @mobilePgArgs -f (Join-Path $PSScriptRoot 'local-db-bootstrap.sql') *> (Join-Path $mobileRunPath 'bootstrap.log')
if ($LASTEXITCODE -ne 0) { throw "Scaffolding failed; read $mobileRunPath/bootstrap.log" }
$mobileMigrations = Get-ChildItem (Join-Path $mobileRoot 'supabase/migrations/*.sql') | Sort-Object Name
foreach ($mobileMigration in $mobileMigrations) {
  $mobileSql = Get-Content -Raw -LiteralPath $mobileMigration.FullName
  # pg_net is absent in vanilla PostgreSQL. The no-network stub above replaces it.
  $mobileSql = $mobileSql -replace '(?im)^create extension if not exists pg_net with schema extensions;','-- Local test: pg_net stubbed; no HTTP calls.'
  $mobileCopy = Join-Path $mobileRunPath $mobileMigration.Name
  Set-Content -LiteralPath $mobileCopy -Value $mobileSql -Encoding utf8
  & "$mobilePgBin/psql.exe" @mobilePgArgs -f $mobileCopy *> (Join-Path $mobileRunPath ($mobileMigration.Name + '.log'))
  if ($LASTEXITCODE -ne 0) { Write-Output "FAILED $($mobileMigration.Name)"; Get-Content (Join-Path $mobileRunPath ($mobileMigration.Name + '.log')) -Tail 10; exit 1 }
}
Write-Output "Applied $($mobileMigrations.Count) migrations in isolated PostgreSQL18; pg_net stubbed."
