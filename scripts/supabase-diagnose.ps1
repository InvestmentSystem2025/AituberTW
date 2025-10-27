Param(
    [int]$Tail = 300,
    [int]$TimeoutSec = 8
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host "== Supabase 診斷開始 ==" -ForegroundColor Cyan

# 1) 準備輸出資料夾
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path -Path (Join-Path -Path (Get-Location) -ChildPath 'logs') -ChildPath "supabase-check-$timestamp"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# 2) 容器清單與狀態
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Out-File "$outDir/docker-ps.txt" -Encoding utf8

# 3) 抓各容器日誌
$containers = @(
  'supabase-db','supabase-auth','supabase-rest','supabase-realtime',
  'supabase-storage','supabase-meta','supabase-studio','supabase-kong'
)
foreach ($c in $containers) {
  try {
    docker logs --tail $Tail $c *>> "$outDir/$c.log"
  } catch {
    "[WARN] $c 日誌擷取失敗: $($_.Exception.Message)" | Out-File "$outDir/$c.log" -Encoding utf8
  }
}

# 4) DB 快速健康檢查
function Invoke-DbQuery {
  param([string]$Sql,[string]$OutFile)
  try {
    docker exec supabase-db psql -U postgres -d postgres -c $Sql |
      Out-File $OutFile -Encoding utf8
  } catch {
    $_ | Out-String | Out-File $OutFile -Encoding utf8
  }
}

Invoke-DbQuery -Sql "SHOW TIMEZONE;" -OutFile "$outDir/db-timezone.txt"
Invoke-DbQuery -Sql "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_admin');" -OutFile "$outDir/db-roles.txt"
Invoke-DbQuery -Sql "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;" -OutFile "$outDir/db-public-tables.txt"
Invoke-DbQuery -Sql "SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relkind='r' ORDER BY 1,2;" -OutFile "$outDir/db-storage-tables.txt"

# 5) 端點健康檢查（經 Kong）
$anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
$headers = @{ Authorization = "Bearer $anon"; apikey = $anon }

function Invoke-HttpJson {
  param([string]$Url,[string]$OkOut,[string]$ErrOut,[hashtable]$Headers)
  try {
    $res = Invoke-RestMethod -Method Get -Uri $Url -Headers $Headers -TimeoutSec $TimeoutSec
    $res | ConvertTo-Json -Depth 6 | Out-File $OkOut -Encoding utf8
  } catch {
    $_ | Out-String | Out-File $ErrOut -Encoding utf8
  }
}

Invoke-HttpJson -Url 'http://localhost:8001/rest/v1' -OkOut "$outDir/rest-root.json" -ErrOut "$outDir/rest-root.error.txt" -Headers $headers
Invoke-HttpJson -Url 'http://localhost:8001/rest/v1/news_articles?select=*&limit=1' -OkOut "$outDir/rest-news-1.json" -ErrOut "$outDir/rest-news-1.error.txt" -Headers $headers

try {
  # 經由 Kong 使用 v1 路徑，strip_path=true 後轉為上游 /status
  $storageRes = Invoke-RestMethod -Method Get -Uri 'http://localhost:8001/storage/v1/status' -TimeoutSec $TimeoutSec
  $storageRes | ConvertTo-Json -Depth 6 | Out-File "$outDir/storage-status.json" -Encoding utf8
} catch {
  $_ | Out-String | Out-File "$outDir/storage-status.error.txt" -Encoding utf8
}

# 額外：列出 buckets 以驗證 Storage 主流程
try {
  $buckets = Invoke-RestMethod -Method Get -Uri 'http://localhost:8001/storage/v1/bucket' -Headers $headers -TimeoutSec $TimeoutSec
  $buckets | ConvertTo-Json -Depth 6 | Out-File "$outDir/storage-buckets.json" -Encoding utf8
} catch {
  $_ | Out-String | Out-File "$outDir/storage-buckets.error.txt" -Encoding utf8
}

try {
  $authRes = Invoke-RestMethod -Method Get -Uri 'http://localhost:8001/auth/v1/health' -TimeoutSec $TimeoutSec
  $authRes | ConvertTo-Json -Depth 6 | Out-File "$outDir/auth-health.json" -Encoding utf8
} catch {
  $_ | Out-String | Out-File "$outDir/auth-health.error.txt" -Encoding utf8
}

try {
  $rtRes = Invoke-RestMethod -Method Get -Uri 'http://localhost:8001/realtime/v1' -TimeoutSec $TimeoutSec
  $rtRes | ConvertTo-Json -Depth 6 | Out-File "$outDir/realtime-info.json" -Encoding utf8
} catch {
  $_ | Out-String | Out-File "$outDir/realtime-info.error.txt" -Encoding utf8
}

try {
  $studio = Invoke-WebRequest -Method Get -Uri 'http://localhost:54323' -TimeoutSec $TimeoutSec
  $studio.StatusCode | Out-File "$outDir/studio-status.txt" -Encoding utf8
} catch {
  $_ | Out-String | Out-File "$outDir/studio-status.error.txt" -Encoding utf8
}

Write-Host "✅ 診斷完成，輸出位於: $outDir" -ForegroundColor Green

