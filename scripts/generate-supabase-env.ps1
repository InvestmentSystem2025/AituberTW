Param(
    [string]$JwtSecret = 'dev-very-strong-jwt-secret-key-for-aituber-kit-2025',
    [string]$PostgresPassword = 'dev-strong-password-2025',
    [string]$SiteUrl = 'http://localhost:8001',
    [string]$AuthRedirectUrl = 'http://localhost:3000'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Minimal HS256 tokens for anon/service_role using the provided secret
function New-HS256Token {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] [hashtable]$Payload
    )
    $header = @{ alg = 'HS256'; typ = 'JWT' }
    $headerB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $header -Compress))).TrimEnd('=') -replace '\+','-' -replace '/','_'
    $payloadB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $Payload -Compress))).TrimEnd('=') -replace '\+','-' -replace '/','_'
    $data = "$headerB64.$payloadB64"
    $keyBytes = [Text.Encoding]::UTF8.GetBytes($Secret)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
    $sig = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($data))
    $sigB64 = [Convert]::ToBase64String($sig).TrimEnd('=') -replace '\+','-' -replace '/','_'
    return "$data.$sigB64"
}

$anonToken = New-HS256Token -Secret $JwtSecret -Payload @{ iss = 'supabase-demo'; role = 'anon' }
$serviceToken = New-HS256Token -Secret $JwtSecret -Payload @{ iss = 'supabase-demo'; role = 'service_role' }

$envDir = Join-Path -Path (Get-Location) -ChildPath 'supabase'
$newEnvPath = Join-Path -Path $envDir -ChildPath 'supabase.env'

$lines = @()
$lines += "# Generated at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$lines += "SITE_URL=$SiteUrl"
$lines += "SUPABASE_AUTH_URL=http://supabase-kong:8000"
$lines += "SUPABASE_AUTH_PUBLIC_URL=$SiteUrl"
$lines += "AUTH_REDIRECT_URL=$AuthRedirectUrl"
$lines += "POSTGRES_PASSWORD=$PostgresPassword"
$lines += "JWT_SECRET=$JwtSecret"
$lines += "SUPABASE_ANON_KEY=$anonToken"
$lines += "SUPABASE_SERVICE_ROLE_KEY=$serviceToken"
$lines += "DATABASE_URL=postgres://postgres:$PostgresPassword@supabase-db:5432/postgres"
$lines += "PGRST_DB_URI=postgres://postgres:$PostgresPassword@supabase-db:5432/postgres"

$null = New-Item -ItemType Directory -Path $envDir -Force
$lines -join "`r`n" | Out-File -FilePath $newEnvPath -Encoding utf8 -Force

Write-Host "Written: $newEnvPath" -ForegroundColor Green
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "1) docker-compose -f docker-compose.ollama.yml down" -ForegroundColor Yellow
Write-Host "2) docker-compose -f docker-compose.ollama.yml up -d --force-recreate supabase-auth supabase-rest supabase-storage supabase-kong" -ForegroundColor Yellow
Write-Host "3) Use tokens from supabase\\supabase.env for API calls" -ForegroundColor Yellow
