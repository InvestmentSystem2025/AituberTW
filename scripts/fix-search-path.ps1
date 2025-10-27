# 修復 PostgreSQL search_path 問題
# 這會更新資料庫的 search_path 設置

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host "== 修復 PostgreSQL search_path ==" -ForegroundColor Cyan

# 檢查容器是否運行
Write-Host "檢查 supabase-db 容器..." -ForegroundColor Cyan
$containerExists = docker ps -q -f name=supabase-db
if (-not $containerExists) {
    Write-Host "❌ supabase-db 容器未運行！" -ForegroundColor Red
    exit 1
}

Write-Host "當前 search_path:" -ForegroundColor Cyan
docker exec supabase-db psql -U postgres -d postgres -c "SHOW search_path;"

Write-Host "`n更新 search_path..." -ForegroundColor Cyan
docker exec supabase-db psql -U postgres -d postgres -c 'ALTER DATABASE postgres SET search_path TO ''$user'', public, auth, storage, extensions;'

Write-Host "`n驗證新的 search_path:" -ForegroundColor Cyan
docker exec supabase-db psql -U postgres -d postgres -c "SHOW search_path;"

Write-Host "`n✅ search_path 已更新！" -ForegroundColor Green
Write-Host "請重啟服務以應用更改：" -ForegroundColor Yellow
Write-Host "   docker-compose restart supabase-auth supabase-rest" -ForegroundColor White

