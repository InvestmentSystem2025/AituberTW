# 首頁RAG整合測試腳本
# 在 VSCode PowerShell 終端中執行

Write-Host "🎙️ 首頁RAG整合測試" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

# 測試新聞相關問題檢測
Write-Host "`n🔍 測試新聞問題檢測:" -ForegroundColor Yellow

$testQuestions = @(
    "最近有什麼新聞？",
    "今天台灣發生了什麼事？",
    "日本有什麼最新消息？",
    "科技新聞有什麼新發展？",
    "你好，今天心情怎麼樣？"
)

foreach ($question in $testQuestions) {
    Write-Host "問題: $question" -ForegroundColor Cyan
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/rag/search/" -Method Post -Body (@{
            query = $question
            collection = "news_knowledge"
            limit = 1
        } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 10
        
        if ($response.count -gt 0) {
            Write-Host "  ✅ 檢測為新聞相關問題，找到 $($response.count) 條相關資料" -ForegroundColor Green
        } else {
            Write-Host "  ℹ️ 未找到相關新聞資料" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ❌ 測試失敗: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 測試RAG搜尋功能
Write-Host "`n📰 測試RAG搜尋功能:" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/rag/search/" -Method Post -Body (@{
        query = "台灣新聞"
        collection = "news_knowledge"
        limit = 3
    } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 10
    
    Write-Host "✅ RAG搜尋功能正常" -ForegroundColor Green
    Write-Host "找到 $($response.count) 條結果" -ForegroundColor Cyan
    
    for ($i = 0; $i -lt [Math]::Min($response.count, 3); $i++) {
        $result = $response.results[$i]
        $preview = $result.content.Substring(0, [Math]::Min(100, $result.content.Length))
        Write-Host "  [$($i+1)] $preview..." -ForegroundColor White
    }
} catch {
    Write-Host "❌ RAG搜尋功能失敗: $($_.Exception.Message)" -ForegroundColor Red
}

# 測試RAG聊天功能
Write-Host "`n💬 測試RAG聊天功能:" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/rag/chat" -Method Post -Body (@{
        messages = @(@{
            role = "user"
            content = "最近有什麼新聞？"
        })
        collection = "news_knowledge"
        ragEnabled = $true
        searchLimit = 3
    } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 15
    
    Write-Host "✅ RAG聊天功能正常" -ForegroundColor Green
    Write-Host "回答: $($response.message.Substring(0, [Math]::Min(200, $response.message.Length)))..." -ForegroundColor Cyan
    Write-Host "找到 $($response.contextCount) 條相關資料" -ForegroundColor Cyan
} catch {
    Write-Host "❌ RAG聊天功能失敗: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n================================" -ForegroundColor Green
Write-Host "測試完成！" -ForegroundColor Green
Write-Host "`n💡 現在您可以在首頁聊天框中測試RAG功能：" -ForegroundColor Cyan
Write-Host "1. 訪問 http://localhost:3000" -ForegroundColor White
Write-Host "2. 在聊天框輸入新聞相關問題" -ForegroundColor White
Write-Host "3. 系統會自動檢測並使用RAG回答" -ForegroundColor White

