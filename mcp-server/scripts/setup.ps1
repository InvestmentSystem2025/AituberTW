# MCP Server 快速設定腳本
# 執行環境：在 VSCode PowerShell 終端執行（位於 C:\dev\AITUBER\mcp-server）

Write-Host "🚀 開始設定 MCP Server..." -ForegroundColor Green

# 檢查 Node.js
Write-Host "`n📦 檢查 Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Node.js 版本: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ 未找到 Node.js，請先安裝 Node.js 20+" -ForegroundColor Red
    exit 1
}

# 檢查 npm
$npmVersion = npm --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ npm 版本: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "✗ 未找到 npm" -ForegroundColor Red
    exit 1
}

# 建立必要目錄
Write-Host "`n📁 建立目錄..." -ForegroundColor Yellow
$directories = @("uploads", "data", "dist")
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
        Write-Host "✓ 建立目錄: $dir" -ForegroundColor Green
    } else {
        Write-Host "✓ 目錄已存在: $dir" -ForegroundColor Green
    }
}

# 複製環境變數檔案
Write-Host "`n⚙️  設定環境變數..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✓ 建立 .env 檔案" -ForegroundColor Green
} else {
    Write-Host "✓ .env 檔案已存在" -ForegroundColor Green
}

# 安裝依賴
Write-Host "`n📦 安裝 npm 依賴..." -ForegroundColor Yellow
Write-Host "這可能需要幾分鐘..." -ForegroundColor Gray
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ 依賴安裝完成" -ForegroundColor Green
} else {
    Write-Host "✗ 依賴安裝失敗" -ForegroundColor Red
    exit 1
}

# 編譯 TypeScript
Write-Host "`n🔨 編譯 TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ 編譯完成" -ForegroundColor Green
} else {
    Write-Host "✗ 編譯失敗" -ForegroundColor Red
    exit 1
}

Write-Host "`n✨ 設定完成！" -ForegroundColor Green
Write-Host "`n接下來的步驟：" -ForegroundColor Cyan
Write-Host "1. 啟動開發伺服器：" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host "`n2. 或啟動正式伺服器：" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Gray
Write-Host "`n3. 測試伺服器：" -ForegroundColor White
Write-Host "   Invoke-RestMethod -Uri http://localhost:3001/health" -ForegroundColor Gray
Write-Host ""

