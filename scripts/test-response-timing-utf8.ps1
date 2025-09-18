# 響應時間測試腳本 (UTF-8 with BOM)
# 在 VSCode PowerShell 終端中執行

Write-Host "⏱️ 新聞查詢響應時間測試 (UTF-8 版本)" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

# 測試問題
$testQuestion = "最近有什麼新聞"

Write-Host "`n🔍 測試問題: $testQuestion" -ForegroundColor Yellow

# 測試1: 直接RAG搜尋（不包含AI生成）
Write-Host "`n📊 測試1: 直接RAG搜尋響應時間" -ForegroundColor Cyan
$startTime1 = Get-Date

try {
    $body = @{
        query = $testQuestion
        collection = "news_knowledge"
        limit = 3
    } | ConvertTo-Json -Depth 3
    
    Write-Host "  🔍 發送查詢: '$testQuestion'" -ForegroundColor Gray
    Write-Host "  📤 請求內容: $body" -ForegroundColor Gray
    
    # 使用 UTF-8 編碼發送請求
    $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $response1 = Invoke-RestMethod -Uri "http://localhost:3000/api/rag/search/" -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8" -TimeoutSec 30
    
    $endTime1 = Get-Date
    $duration1 = ($endTime1 - $startTime1).TotalMilliseconds
    
    Write-Host "  ✅ RAG搜尋完成" -ForegroundColor Green
    Write-Host "  ⏱️ 響應時間: $([math]::Round($duration1, 2)) 毫秒" -ForegroundColor White
    Write-Host "  📊 找到 $($response1.count) 條相關資料" -ForegroundColor Cyan
    
    # 顯示搜尋結果預覽
    for ($i = 0; $i -lt [Math]::Min($response1.count, 2); $i++) {
        $result = $response1.results[$i]
        $preview = $result.content.Substring(0, [Math]::Min(80, $result.content.Length))
        Write-Host "    [$($i+1)] $preview..." -ForegroundColor Gray
    }
} catch {
    Write-Host "  ❌ RAG搜尋失敗: $($_.Exception.Message)" -ForegroundColor Red
}

# 測試2: 完整RAG聊天（包含AI生成）
Write-Host "`n🤖 測試2: 完整RAG聊天響應時間" -ForegroundColor Cyan
$startTime2 = Get-Date

try {
    $body2 = @{
        messages = @(@{
            role = "user"
            content = $testQuestion
        })
        collection = "news_knowledge"
        ragEnabled = $true
        searchLimit = 3
        model = "gpt-oss:20b"
        temperature = 0.7
        maxTokens = 4096
    } | ConvertTo-Json -Depth 3
    
    Write-Host "  🔍 發送查詢: '$testQuestion'" -ForegroundColor Gray
    
    # 使用 UTF-8 編碼發送請求
    $utf8Bytes2 = [System.Text.Encoding]::UTF8.GetBytes($body2)
    $response2 = Invoke-RestMethod -Uri "http://localhost:3000/api/rag/chat/" -Method Post -Body $utf8Bytes2 -ContentType "application/json; charset=utf-8" -TimeoutSec 180
    
    $endTime2 = Get-Date
    $duration2 = ($endTime2 - $startTime2).TotalMilliseconds
    
    Write-Host "  ✅ RAG聊天完成" -ForegroundColor Green
    Write-Host "  ⏱️ 總響應時間: $([math]::Round($duration2, 2)) 毫秒" -ForegroundColor White
    Write-Host "  📊 找到 $($response2.contextCount) 條相關資料" -ForegroundColor Cyan
    Write-Host "  🤖 AI回答長度: $($response2.message.Length) 字符" -ForegroundColor Cyan
    
    # 檢查是否包含新聞相關內容
    $isNewsRelated = $response2.message -match "新聞|消息|報導|事件|發生|最新|最近"
    if ($isNewsRelated) {
        Write-Host "  📰 檢測到新聞相關回答" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ 未檢測到新聞相關回答" -ForegroundColor Yellow
    }
    
    # 顯示AI回答預覽
    $preview = $response2.message.Substring(0, [Math]::Min(150, $response2.message.Length))
    Write-Host "  💬 AI回答預覽: $preview..." -ForegroundColor Gray
} catch {
    Write-Host "  ❌ RAG聊天失敗: $($_.Exception.Message)" -ForegroundColor Red
}

# 測試3: 前端完整流程模擬（包含RAG整合）
Write-Host "`n🌐 測試3: 前端完整流程響應時間（包含RAG整合）" -ForegroundColor Cyan
$startTime3 = Get-Date

try {
    # 模擬前端發送消息到後端API，讓RAG整合自動處理
    $body3 = @{
        messages = @(
            @{
                role = "user"
                content = $testQuestion
            }
        )
        stream = $false
        aiService = "ollama"
        model = "gpt-oss:20b"
        localLlmUrl = "http://ollama:11434"
        temperature = 0.7
        maxTokens = 4096
    } | ConvertTo-Json -Depth 3
    
    Write-Host "  🔍 發送查詢: '$testQuestion'" -ForegroundColor Gray
    
    # 使用 UTF-8 編碼發送請求
    $utf8Bytes3 = [System.Text.Encoding]::UTF8.GetBytes($body3)
    $response3 = Invoke-RestMethod -Uri "http://localhost:3000/api/ai/vercel/" -Method Post -Body $utf8Bytes3 -ContentType "application/json; charset=utf-8" -TimeoutSec 180
    
    $endTime3 = Get-Date
    $duration3 = ($endTime3 - $startTime3).TotalMilliseconds
    
    Write-Host "  ✅ 前端完整流程完成" -ForegroundColor Green
    Write-Host "  ⏱️ 總響應時間: $([math]::Round($duration3, 2)) 毫秒" -ForegroundColor White
    Write-Host "  🤖 AI回答長度: $($response3.text.Length) 字符" -ForegroundColor Cyan
    
    # 檢查是否包含新聞相關內容
    $isNewsRelated = $response3.text -match "新聞|消息|報導|事件|發生|最新|最近"
    if ($isNewsRelated) {
        Write-Host "  📰 檢測到新聞相關回答" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ 未檢測到新聞相關回答" -ForegroundColor Yellow
    }
    
    # 顯示AI回答預覽
    $preview = $response3.text.Substring(0, [Math]::Min(150, $response3.text.Length))
    Write-Host "  💬 AI回答預覽: $preview..." -ForegroundColor Gray
} catch {
    Write-Host "  ❌ 前端完整流程失敗: $($_.Exception.Message)" -ForegroundColor Red
}

# 總結
Write-Host "`n📈 響應時間總結:" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

if ($duration1) {
    Write-Host "🔍 RAG搜尋: $([math]::Round($duration1, 2)) 毫秒" -ForegroundColor White
}
if ($duration2) {
    Write-Host "🤖 RAG聊天: $([math]::Round($duration2, 2)) 毫秒" -ForegroundColor White
}
if ($duration3) {
    Write-Host "🌐 前端流程: $([math]::Round($duration3, 2)) 毫秒" -ForegroundColor White
}

Write-Host "`n💡 響應時間分析:" -ForegroundColor Cyan
Write-Host "- RAG搜尋時間: 向量資料庫查詢 + 相似度計算" -ForegroundColor Gray
Write-Host "- AI生成時間: 模型推理 + 文本生成" -ForegroundColor Gray
Write-Host "- 網路傳輸時間: HTTP請求/回應延遲" -ForegroundColor Gray
Write-Host "- 前端處理時間: JavaScript執行 + DOM更新" -ForegroundColor Gray

Write-Host "`n🔧 編碼問題解決方案:" -ForegroundColor Yellow
Write-Host "- 使用 UTF-8 字節陣列發送請求" -ForegroundColor Gray
Write-Host "- 明確指定 charset=utf-8" -ForegroundColor Gray
Write-Host "- 避免 PowerShell 自動編碼轉換" -ForegroundColor Gray

Write-Host "`n================================" -ForegroundColor Green
Write-Host "測試完成！" -ForegroundColor Green
