# MCP Server 開發模式啟動腳本
Write-Host "🚀 啟動 MCP Server (開發模式)..." -ForegroundColor Cyan
Write-Host ""

# 檢查 Docker 是否運行
Write-Host "📦 檢查 Docker Desktop..." -ForegroundColor Yellow
$dockerRunning = docker info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Docker Desktop 未運行" -ForegroundColor Red
    Write-Host "請先啟動 Docker Desktop" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Docker Desktop 正在運行" -ForegroundColor Green
Write-Host ""

# 建立持久化目錄
Write-Host "📁 建立持久化目錄..." -ForegroundColor Yellow
$dirs = @("uploads", "data")
foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
        Write-Host "✓ 目錄已建立: $dir" -ForegroundColor Green
    } else {
        Write-Host "✓ 目錄已存在: $dir" -ForegroundColor Green
    }
}
Write-Host ""

# 停止現有容器
Write-Host "🔄 停止現有容器..." -ForegroundColor Yellow
docker-compose -f docker-compose.dev.yml down 2>$null
Write-Host ""

# 啟動開發模式容器
Write-Host "🚀 啟動開發模式容器..." -ForegroundColor Cyan
Write-Host "這可能需要幾分鐘（首次需要下載基礎映像）..." -ForegroundColor Gray
Write-Host ""

docker-compose -f docker-compose.dev.yml up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ 開發容器啟動成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "📝 開發模式特性：" -ForegroundColor Yellow
    Write-Host "  • 修改代碼會自動重新載入" -ForegroundColor White
    Write-Host "  • 無需重新 build 容器" -ForegroundColor White
    Write-Host "  • 源碼掛載到容器內" -ForegroundColor White
    Write-Host ""
    Write-Host "🌐 API 端點：" -ForegroundColor Yellow
    Write-Host "  • http://localhost:3001" -ForegroundColor White
    Write-Host "  • http://localhost:3001/mcp/tools" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 實用指令：" -ForegroundColor Yellow
    Write-Host "  • 查看日誌: docker logs -f mcp-server-dev" -ForegroundColor White
    Write-Host "  • 停止容器: docker-compose -f docker-compose.dev.yml down" -ForegroundColor White
    Write-Host "  • 測試 API: .\scripts\test-api.ps1" -ForegroundColor White
    Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    # 等待服務啟動
    Write-Host "⏳ 等待服務啟動..." -ForegroundColor Yellow
    $maxAttempts = 30
    $attempt = 0
    $success = $false
    
    while ($attempt -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3001/mcp/tools" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $success = $true
                break
            }
        } catch {
            # 繼續等待
        }
        Start-Sleep -Seconds 1
        $attempt++
    }
    
    Write-Host ""
    if ($success) {
        Write-Host "✓ API 已就緒！" -ForegroundColor Green
        Write-Host ""
        Write-Host "現在你可以修改代碼，容器會自動重新載入 🔄" -ForegroundColor Cyan
    } else {
        Write-Host "⚠ 服務可能還在啟動中..." -ForegroundColor Yellow
        Write-Host "請執行以下指令查看日誌：" -ForegroundColor White
        Write-Host "  docker logs -f mcp-server-dev" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "✗ 開發容器啟動失敗" -ForegroundColor Red
    Write-Host "請查看錯誤訊息或執行以下指令查看詳細日誌：" -ForegroundColor Yellow
    Write-Host "  docker-compose -f docker-compose.dev.yml up --build" -ForegroundColor Gray
}

Write-Host ""

