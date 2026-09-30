$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$verificationFile = Join-Path $repoRoot "database\verify\schema.sql"

Push-Location $repoRoot
try {
    $dbUser = (docker compose exec -T postgres printenv POSTGRES_USER).Trim()
    $dbName = (docker compose exec -T postgres printenv POSTGRES_DB).Trim()
    Get-Content -Raw -LiteralPath $verificationFile | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Database verification failed." }
}
finally {
    Pop-Location
}
