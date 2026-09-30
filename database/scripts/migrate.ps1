$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migrationDir = Join-Path $repoRoot "database\migrations"

Push-Location $repoRoot
try {
    $dbUser = (docker compose exec -T postgres printenv POSTGRES_USER).Trim()
    $dbName = (docker compose exec -T postgres printenv POSTGRES_DB).Trim()
    docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -c "CREATE SCHEMA IF NOT EXISTS app_private; CREATE TABLE IF NOT EXISTS app_private.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Unable to initialize migration tracking." }

    Get-ChildItem -LiteralPath $migrationDir -Filter "*.sql" | Sort-Object Name | ForEach-Object {
        $version = $_.BaseName
        $escapedVersion = $version.Replace("'", "''")
        $alreadyApplied = docker compose exec -T postgres psql -U $dbUser -d $dbName -tAc "SELECT 1 FROM app_private.schema_migrations WHERE version = '$escapedVersion'"
        if ($LASTEXITCODE -ne 0) { throw "Unable to read migration state for $version." }

        if ($alreadyApplied -eq "1") {
            Write-Host "skip  $version"
            return
        }

        Write-Host "apply $version"
        $migrationSql = Get-Content -Raw -LiteralPath $_.FullName
        $transactionalSql = "BEGIN;`n$migrationSql`nINSERT INTO app_private.schema_migrations(version) VALUES ('$escapedVersion');`nCOMMIT;"
        $transactionalSql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Migration $version failed and was rolled back." }
    }
}
finally {
    Pop-Location
}
