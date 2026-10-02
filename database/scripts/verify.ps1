$ErrorActionPreference = "Stop"
$previousEncoding = $OutputEncoding
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$verificationFile = Join-Path $repoRoot "database\verify\schema.sql"

Push-Location $repoRoot
try {
    $dbUser = docker compose exec -T postgres printenv POSTGRES_USER
    if ($LASTEXITCODE -ne 0 -or !$dbUser) { throw "PostgreSQL unavailable. Run npm run db:up first." }
    $dbName = docker compose exec -T postgres printenv POSTGRES_DB
    if ($LASTEXITCODE -ne 0 -or !$dbName) { throw "Unable to read PostgreSQL database name." }
    Get-Content -Raw -Encoding UTF8 -LiteralPath $verificationFile | docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U $dbUser.Trim() -d $dbName.Trim() | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Database verification failed." }
}
finally {
    $OutputEncoding = $previousEncoding
    Pop-Location
}
