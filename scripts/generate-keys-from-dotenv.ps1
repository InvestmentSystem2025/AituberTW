Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$dotenvPath = Join-Path -Path (Get-Location) -ChildPath '.env'
if (-not (Test-Path $dotenvPath)) { throw ".env not found at $dotenvPath" }

# Parse .env to hashtable
$lines = Get-Content $dotenvPath -Encoding UTF8
$kv = @{}
foreach ($ln in $lines) {
    if ($ln -match '^[#\s]') { continue }
    $idx = $ln.IndexOf('=')
    if ($idx -lt 1) { continue }
    $k = $ln.Substring(0,$idx).Trim()
    $v = $ln.Substring($idx+1).Trim()
    $kv[$k] = $v
}

if (-not $kv.ContainsKey('JWT_SECRET')) { throw 'JWT_SECRET not set in .env' }
$secret = $kv['JWT_SECRET']

function New-HS256Token {
    param([string]$Secret,[hashtable]$Payload)
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

$anon = New-HS256Token -Secret $secret -Payload @{ iss = 'aituber-kit'; role = 'anon' }
$service = New-HS256Token -Secret $secret -Payload @{ iss = 'aituber-kit'; role = 'service_role' }

$kv['SUPABASE_ANON_KEY'] = $anon
$kv['SUPABASE_SERVICE_ROLE_KEY'] = $service

# Recompose .env with preserved ordering when possible
$knownKeys = @()
$newLines = @()
foreach ($ln in $lines) {
    if ($ln -match '^[#\s]') { $newLines += $ln; continue }
    $idx = $ln.IndexOf('=')
    if ($idx -lt 1) { $newLines += $ln; continue }
    $k = $ln.Substring(0,$idx).Trim()
    if ($k -eq 'SUPABASE_ANON_KEY') {
        $newLines += "SUPABASE_ANON_KEY=$($kv['SUPABASE_ANON_KEY'])"; $knownKeys += $k; continue
    }
    if ($k -eq 'SUPABASE_SERVICE_ROLE_KEY') {
        $newLines += "SUPABASE_SERVICE_ROLE_KEY=$($kv['SUPABASE_SERVICE_ROLE_KEY'])"; $knownKeys += $k; continue
    }
    $newLines += $ln
}

# Append keys if not present
if (-not $knownKeys.Contains('SUPABASE_ANON_KEY')) { $newLines += "SUPABASE_ANON_KEY=$($kv['SUPABASE_ANON_KEY'])" }
if (-not $knownKeys.Contains('SUPABASE_SERVICE_ROLE_KEY')) { $newLines += "SUPABASE_SERVICE_ROLE_KEY=$($kv['SUPABASE_SERVICE_ROLE_KEY'])" }

$newLines | Out-File $dotenvPath -Encoding utf8 -Force

Write-Host 'Updated .env with SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY derived from JWT_SECRET' -ForegroundColor Green
