# Docker 快速啟動 MCP Server
# 執行環境：在 VSCode PowerShell 終端執行（位於 C:\dev\AITUBER\mcp-server）

Write-Host "🐳 啟動 MCP Server (Docker 模式)..." -ForegroundColor Green

# 檢查 Docker 是否運行
Write-Host "`n📦 檢查 Docker Desktop..." -ForegroundColor Yellow
$dockerRunning = docker info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Docker Desktop 未運行" -ForegroundColor Red
    Write-Host "請先啟動 Docker Desktop，然後重試" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Docker Desktop 正在運行" -ForegroundColor Green

# 建立必要目錄
Write-Host "`n📁 建立持久化目錄..." -ForegroundColor Yellow
$directories = @("uploads", "data")
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
        Write-Host "✓ 建立目錄: $dir" -ForegroundColor Green
    } else {
        Write-Host "✓ 目錄已存在: $dir" -ForegroundColor Green
    }
}

# 停止舊容器（如果存在）
Write-Host "`n🔄 檢查現有容器..." -ForegroundColor Yellow
$existingContainer = docker ps -a -q -f name=mcp-server
if ($existingContainer) {
    Write-Host "停止現有容器..." -ForegroundColor Gray
    docker-compose down | Out-Null
}

# 建立並啟動容器
Write-Host "`n🚀 建立並啟動 Docker 容器..." -ForegroundColor Yellow
Write-Host "這可能需要幾分鐘（首次需要下載基礎映像）..." -ForegroundColor Gray

docker-compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✨ MCP Server 已成功啟動！" -ForegroundColor Green
    
    # 等待容器完全啟動
    Write-Host "`n⏳ 等待服務準備就緒..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    
    # 測試健康檢查
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3001/health" -TimeoutSec 5
        Write-Host "✓ 服務健康檢查通過" -ForegroundColor Green
        Write-Host "  狀態: $($response.status)" -ForegroundColor Gray
        Write-Host "  訊息: $($response.message)" -ForegroundColor Gray
    } catch {
        Write-Host "⚠️  服務可能還在啟動中，請稍後測試" -ForegroundColor Yellow
    }
    
    Write-Host "`n📊 容器資訊：" -ForegroundColor Cyan
    docker ps -f name=mcp-server --format "table {{.ID}}\t{{.Status}}\t{{.Ports}}"
    
    Write-Host "`n接下來的步驟：" -ForegroundColor Cyan
    Write-Host "1. 查看日誌：" -ForegroundColor White
    Write-Host "   docker logs -f mcp-server" -ForegroundColor Gray
    Write-Host "`n2. 測試 API：" -ForegroundColor White
    Write-Host "   .\scripts\test-api.ps1" -ForegroundColor Gray
    Write-Host "`n3. 停止容器：" -ForegroundColor White
    Write-Host "   docker-compose down" -ForegroundColor Gray
    Write-Host "`n4. 啟動 aituber-kit：" -ForegroundColor White
    Write-Host "   cd ..\aituber-kit" -ForegroundColor Gray
    Write-Host "   npm run dev" -ForegroundColor Gray
    Write-Host "`n🌐 服務地址：http://localhost:3001" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "`n✗ 容器啟動失敗" -ForegroundColor Red
    Write-Host "請查看錯誤訊息或執行以下指令查看詳細日誌：" -ForegroundColor Yellow
    Write-Host "docker-compose up --build" -ForegroundColor Gray
    exit 1
}

