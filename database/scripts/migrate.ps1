$ErrorActionPreference = "Stop"
$previousEncoding = $OutputEncoding
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migrationDir = Join-Path $repoRoot "database\migrations"

Push-Location $repoRoot
try {
    $dbUser = docker compose exec -T postgres printenv POSTGRES_USER
    if ($LASTEXITCODE -ne 0 -or !$dbUser) { throw "PostgreSQL unavailable. Run npm run db:up first." }
    $dbUser = $dbUser.Trim()
    $dbName = docker compose exec -T postgres printenv POSTGRES_DB
    if ($LASTEXITCODE -ne 0 -or !$dbName) { throw "Unable to read PostgreSQL database name." }
    $dbName = $dbName.Trim()

    Get-ChildItem -LiteralPath $migrationDir -Filter "*.sql" | Sort-Object Name | ForEach-Object {
        $version = $_.BaseName
        $escapedVersion = $version.Replace("'", "''")
        $migrationSql = Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName
        # Lock and state check use the same connection and transaction.
        $transactionalSql = @"
BEGIN;
SELECT pg_advisory_xact_lock(731249810);
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE IF NOT EXISTS app_private.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
SELECT EXISTS(SELECT 1 FROM app_private.schema_migrations WHERE version = '$escapedVersion') AS applied \gset
\if :applied
\echo skip $version
\else
\echo apply $version
$migrationSql
INSERT INTO app_private.schema_migrations(version) VALUES ('$escapedVersion');
\endif
COMMIT;
"@
        $transactionalSql | docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Migration $version failed and was rolled back." }
    }
}
finally {
    $OutputEncoding = $previousEncoding
    Pop-Location
}
