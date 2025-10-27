# 修復 Supabase Auth Schema 問題
# 這個腳本會檢查並修復缺失的 auth schema 和表

param(
    [switch]$DryRun = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host "== 修復 Supabase Auth Schema ==" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "[DRY RUN 模式，不會實際修改數據庫]" -ForegroundColor Yellow
}

# 檢查容器是否運行
Write-Host "檢查 supabase-db 容器..." -ForegroundColor Cyan
$containerExists = docker ps -q -f name=supabase-db
if (-not $containerExists) {
    Write-Host "❌ supabase-db 容器未運行！請先啟動：" -ForegroundColor Red
    Write-Host "   docker-compose up -d supabase-db" -ForegroundColor Yellow
    exit 1
}

# 創建修復 SQL
$fixSql = @"
-- 檢查並創建 auth schema
DO `$\$
BEGIN
  CREATE SCHEMA IF NOT EXISTS auth;
  RAISE NOTICE 'auth schema created or already exists';
END;
`$\$;

-- 確保 roles 存在
DO `$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
    RAISE NOTICE 'Role anon created';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
    RAISE NOTICE 'Role authenticated created';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOINHERIT;
    RAISE NOTICE 'Role service_role created';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin;
    RAISE NOTICE 'Role supabase_admin created';
  END IF;
END;
`$\$;

-- 基礎權限
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supabase_admin;
GRANT ALL ON SCHEMA auth TO supabase_admin;

-- 創建 identities 表（如果不存在）
CREATE TABLE IF NOT EXISTS auth.identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  user_id UUID NOT NULL,
  provider_id TEXT NOT NULL,
  identity_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

-- 創建索引（如果不存在）
DO `$\$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_identities_user_id ON auth.identities(user_id);
  CREATE INDEX IF NOT EXISTS idx_identities_email ON auth.identities((identity_data->>'email'));
EXCEPTION WHEN OTHERS THEN
  NULL; -- 如果索引已存在則忽略
END;
`$\$;

-- 權限設置
GRANT ALL ON auth.identities TO service_role;
GRANT SELECT, INSERT, UPDATE ON auth.identities TO authenticated;

-- 檢查結果
SELECT '✓ auth schema 修復完成' AS status;
"@

if ($DryRun) {
    Write-Host "`n將執行以下 SQL：" -ForegroundColor Yellow
    Write-Host $fixSql -ForegroundColor Gray
} else {
    Write-Host "執行修復 SQL..." -ForegroundColor Cyan
    
    try {
        $output = docker exec -i supabase-db psql -U postgres -d postgres -c $fixSql 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ 修復完成！" -ForegroundColor Green
            
            Write-Host "`n檢查當前狀態..." -ForegroundColor Cyan
            docker exec supabase-db psql -U postgres -d postgres -c @"
\dx
\c - anon
\d auth.identities
"@
            
            Write-Host "`n建議重啟 supabase-auth 服務：" -ForegroundColor Yellow
            Write-Host "   docker-compose restart supabase-auth" -ForegroundColor White
        } else {
            Write-Host "❌ 修復失敗：" -ForegroundColor Red
            Write-Host $output -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ 執行錯誤：" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

