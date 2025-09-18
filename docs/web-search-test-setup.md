# Web Search 測試功能設定指南

## 概述

此功能實現了使用 OpenAI Responses API 與 web search 工具的獨立測試頁面，讓您可以測試即時網路搜尋功能。

## 檔案結構

```
src/
├── pages/
│   ├── web-search-test.tsx    # 測試頁面 UI
│   └── api/
│       └── web-search.ts      # API 路由處理
```

## 環境變數設定

在您的 `.env.local` 檔案中添加以下環境變數：

```bash
# OpenAI API 金鑰 (必需)
OPENAI_API_KEY=your_openai_api_key_here
```

### 取得 OpenAI API 金鑰

1. 前往 [OpenAI Platform](https://platform.openai.com/api-keys)
2. 登入您的帳戶
3. 點擊 "Create new secret key"
4. 複製產生的金鑰並設定到環境變數中

## 使用方法

### 1. 啟動開發伺服器

在 VSCode PowerShell 終端執行：
```powershell
npm run dev
```

### 2. 訪問測試頁面

在瀏覽器中訪問：
```
http://localhost:3000/web-search-test
```

### 3. 測試功能

- 在輸入框中輸入您想查詢的內容
- 點擊「搜尋」按鈕或按 Enter 鍵
- 系統會使用 web search 工具搜尋網路資訊並生成回覆

## 建議的測試查詢

- "今天的天氣如何？"
- "最新的科技新聞"
- "比特幣現在的價格"
- "2024年的重要科技趨勢"
- "某個公司的股價"

## 技術細節

### API 實作

- 使用 OpenAI Responses API
- 模型：`gpt-4o`
- 工具：`web_search_preview`
- 溫度設定：0.1（確保基於搜尋結果的回覆）

### 錯誤處理

- API 金鑰驗證
- 請求頻率限制
- 配額檢查
- 網路錯誤處理

## 注意事項

1. **API 配額**：Web search 功能可能需要額外的 API 配額
2. **費用**：請注意 OpenAI API 的使用費用
3. **測試環境**：建議先在測試環境中進行測試
4. **獨立性**：此功能完全獨立，不會影響專案其他功能

## 故障排除

### 常見錯誤

1. **API 金鑰無效**
   - 檢查 `.env.local` 中的 `OPENAI_API_KEY` 是否正確設定
   - 確認金鑰沒有過期

2. **配額不足**
   - 檢查 OpenAI 帳戶餘額
   - 確認 API 使用配額

3. **請求頻率過高**
   - 等待一段時間後重試
   - 檢查是否有其他程序同時使用 API

### 日誌查看

API 請求的詳細日誌會輸出到控制台，包括：
- 查詢內容
- Token 使用量
- 錯誤訊息

## 安全性

- API 金鑰僅在伺服器端使用
- 不會在客戶端暴露敏感資訊
- 建議在生產環境中使用適當的速率限制
