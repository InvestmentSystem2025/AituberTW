# 測試 MCP Server API
# 執行環境：在 VSCode PowerShell 終端執行（位於 C:\dev\AITUBER\mcp-server）

$MCP_URL = "http://localhost:3001"

Write-Host "🧪 測試 MCP Server API..." -ForegroundColor Green

# 測試 1: 健康檢查
Write-Host "`n📋 測試 1: 健康檢查" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$MCP_URL/health" -Method Get
    Write-Host "✓ 健康檢查通過" -ForegroundColor Green
    Write-Host "  狀態: $($response.status)" -ForegroundColor Gray
    Write-Host "  訊息: $($response.message)" -ForegroundColor Gray
} catch {
    Write-Host "✗ 健康檢查失敗: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "請確保 MCP Server 正在運行 (npm run dev)" -ForegroundColor Yellow
    exit 1
}

# 測試 2: 列出 MCP 工具
Write-Host "`n📋 測試 2: 列出 MCP 工具" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$MCP_URL/api/mcp/tools" -Method Get
    Write-Host "✓ 成功取得工具列表" -ForegroundColor Green
    Write-Host "  可用工具數量: $($response.tools.Count)" -ForegroundColor Gray
    foreach ($tool in $response.tools) {
        Write-Host "  - $($tool.name): $($tool.description)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ 取得工具列表失敗: $($_.Exception.Message)" -ForegroundColor Red
}

# 測試 3: 列出檔案
Write-Host "`n📋 測試 3: 列出已上傳檔案" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$MCP_URL/api/files/list" -Method Get
    Write-Host "✓ 成功列出檔案" -ForegroundColor Green
    Write-Host "  檔案數量: $($response.count)" -ForegroundColor Gray
    if ($response.files.Count -gt 0) {
        foreach ($file in $response.files) {
            Write-Host "  - $($file.name) ($($file.size) bytes)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  目前沒有上傳的檔案" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ 列出檔案失敗: $($_.Exception.Message)" -ForegroundColor Red
}

# 測試 4: 測試 MCP 工具（list_files）
Write-Host "`n📋 測試 4: 呼叫 MCP 工具 (list_files)" -ForegroundColor Cyan
try {
    $body = @{
        tool = "list_files"
        arguments = @{}
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$MCP_URL/api/mcp/tool" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ MCP 工具呼叫成功" -ForegroundColor Green
    Write-Host "  工具: $($response.tool)" -ForegroundColor Gray
    Write-Host "  結果: $($response.result.fileCount) 個檔案" -ForegroundColor Gray
} catch {
    Write-Host "✗ MCP 工具呼叫失敗: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✨ API 測試完成！" -ForegroundColor Green
Write-Host "`n💡 提示：" -ForegroundColor Cyan
Write-Host "  - 上傳測試檔案: 使用 POST $MCP_URL/api/files/upload" -ForegroundColor Gray
Write-Host "  - 呼叫 MCP 工具: 使用 POST $MCP_URL/api/mcp/tool" -ForegroundColor Gray
Write-Host "  - 查看文件: 開啟 SETUP_GUIDE.md" -ForegroundColor Gray
Write-Host ""

