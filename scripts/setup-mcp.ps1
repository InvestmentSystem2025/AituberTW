# MCP Server 和 OCR 服務設置腳本
# 此腳本會在 aituber-kit 的 docker-compose 中啟動 MCP 和 OCR 服務

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MCP Server + OCR 服務設置工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 檢查 Docker 是否運行
Write-Host "檢查 Docker 狀態..." -ForegroundColor Yellow
try {
    $dockerStatus = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Docker 未運行，請先啟動 Docker Desktop" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Docker 正在運行" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker 未安裝或無法訪問" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  啟動 MCP Server 和 OCR 服務" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 確認要使用的 docker-compose 檔案
$composeFile = "docker-compose.ollama.yml"

Write-Host "使用配置檔案: $composeFile" -ForegroundColor Yellow
Write-Host "包含的服務:" -ForegroundColor Yellow
Write-Host "  - Ollama (LLM)" -ForegroundColor Gray
Write-Host "  - ChromaDB (向量資料庫)" -ForegroundColor Gray
Write-Host "  - n8n (自動化)" -ForegroundColor Gray
Write-Host "  - OCR Service (PDF OCR)" -ForegroundColor Cyan
Write-Host "  - MCP Server (履歷處理)" -ForegroundColor Cyan
Write-Host "  - App (AI Tuber)" -ForegroundColor Gray
Write-Host ""

# 停止舊的服務
Write-Host "停止現有服務..." -ForegroundColor Yellow
docker-compose -f $composeFile down

Write-Host ""
Write-Host "建構並啟動所有服務（首次需要 10-15 分鐘）..." -ForegroundColor Yellow
docker-compose -f $composeFile up -d --build

Write-Host ""
Write-Host "等待服務啟動..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 檢查服務狀態
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  服務狀態檢查" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 檢查 OCR 服務
Write-Host "檢查 OCR 服務..." -ForegroundColor Yellow
try {
    $ocrHealth = Invoke-RestMethod -Uri "http://localhost:5000/health" -TimeoutSec 5
    if ($ocrHealth.status -eq "ok") {
        Write-Host "✓ OCR 服務正常運行" -ForegroundColor Green
        Write-Host "  版本: $($ocrHealth.tesseract_version)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ OCR 服務未啟動或無法訪問" -ForegroundColor Red
}

# 檢查 MCP Server
Write-Host "檢查 MCP Server..." -ForegroundColor Yellow
try {
    $mcpHealth = Invoke-RestMethod -Uri "http://localhost:3001/health" -TimeoutSec 5
    if ($mcpHealth.status -eq "ok") {
        Write-Host "✓ MCP Server 正常運行" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ MCP Server 未啟動或無法訪問" -ForegroundColor Red
}

# 檢查 Ollama
Write-Host "檢查 Ollama..." -ForegroundColor Yellow
try {
    $ollamaCheck = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
    Write-Host "✓ Ollama 正常運行" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Ollama 未啟動（可能需要更多時間）" -ForegroundColor Yellow
}

# 檢查 ChromaDB
Write-Host "檢查 ChromaDB..." -ForegroundColor Yellow
try {
    $chromaCheck = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/heartbeat" -TimeoutSec 5
    Write-Host "✓ ChromaDB 正常運行" -ForegroundColor Green
} catch {
    Write-Host "⚠️  ChromaDB 未啟動（可能需要更多時間）" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  設置完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "服務端口:" -ForegroundColor Yellow
Write-Host "  - AI Tuber Kit:  http://localhost:3000" -ForegroundColor White
Write-Host "  - MCP Server:    http://localhost:3001" -ForegroundColor Cyan
Write-Host "  - OCR Service:   http://localhost:5000" -ForegroundColor Cyan
Write-Host "  - n8n:           http://localhost:5678" -ForegroundColor White
Write-Host "  - ChromaDB:      http://localhost:8000" -ForegroundColor White
Write-Host "  - Ollama:        http://localhost:11434" -ForegroundColor White
Write-Host ""
Write-Host "查看日誌:" -ForegroundColor Yellow
Write-Host "  docker-compose -f $composeFile logs -f" -ForegroundColor Gray
Write-Host ""
Write-Host "停止服務:" -ForegroundColor Yellow
Write-Host "  docker-compose -f $composeFile down" -ForegroundColor Gray
Write-Host ""

