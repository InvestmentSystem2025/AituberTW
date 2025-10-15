# 啟動 MCP Server 開發模式
# 執行環境：在 VSCode PowerShell 終端執行（位於 C:\dev\AITUBER\mcp-server）

Write-Host "🚀 啟動 MCP Server (開發模式)..." -ForegroundColor Green

# 檢查 .env 檔案
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env 檔案不存在，正在建立..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✓ 已建立 .env 檔案" -ForegroundColor Green
}

# 檢查 node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  依賴未安裝，正在安裝..." -ForegroundColor Yellow
    npm install
}

# 啟動開發伺服器
Write-Host "`n🎯 啟動伺服器於 http://localhost:3001" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止伺服器`n" -ForegroundColor Gray

npm run dev

