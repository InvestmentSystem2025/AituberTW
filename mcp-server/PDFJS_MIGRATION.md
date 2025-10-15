# PDF 解析引擎遷移說明

## 變更內容

已將 MCP 伺服器的 PDF 解析引擎從 `pdf-parse` 遷移至 `pdfjs-dist`。

### 為什麼要遷移？

- **文字提取問題**：pdf-parse 在解析某些 PDF 時會出現嚴重的文字遺漏問題
- **更好的支援**：pdfjs-dist 是 Mozilla 的官方 PDF 解析庫，支援更完善
- **更精確的文字提取**：能夠更準確地提取 PDF 中的文字內容，包括日文、中文等多語言

## 修改的檔案

1. **package.json**
   - 移除：`pdf-parse` 和 `@types/pdf-parse`
   - 新增：`pdfjs-dist` 和 `canvas`

2. **src/tools/pdfTools.ts**
   - 完全重寫 `readPDF` 函數
   - 使用 `pdfjs-dist` API 進行文字提取
   - 新增更詳細的日誌輸出
   - 支援逐頁文字提取和整體文字提取

3. **Dockerfile**
   - 新增 canvas 需要的系統依賴（cairo, jpeg, pango 等）
   - 移除舊的 pdf-parse 測試文件創建邏輯

## 新功能

### 更詳細的文字提取資訊

新的 API 回傳格式：

```json
{
  "success": true,
  "filePath": "檔案路徑",
  "pageCount": 頁數,
  "text": "完整文字內容",
  "pages": [
    {
      "pageNumber": 1,
      "text": "第一頁的文字"
    }
  ],
  "info": { PDF 資訊 },
  "metadata": { PDF 元數據 }
}
```

### 更好的除錯日誌

- 每頁文字提取都會輸出日誌
- 顯示文字長度和預覽
- 顯示整體 PDF 資訊

## 重新啟動 Docker

### 方法 1：使用 docker-compose（推薦）

**在 VSCode PowerShell 終端執行：**

```powershell
# 停止並移除舊容器
cd C:\dev\AITUBER\mcp-server
docker-compose down

# 重新建構並啟動（這會使用新的依賴）
docker-compose up -d --build

# 查看日誌確認是否正常啟動
docker-compose logs -f
```

### 方法 2：使用 PowerShell 腳本

**在 VSCode PowerShell 終端執行：**

```powershell
cd C:\dev\AITUBER\mcp-server
.\scripts\docker-start.ps1
```

### 驗證是否成功

啟動後，檢查日誌中是否有以下內容：

```
MCP Server is running on port 3001
HTTP API is running on http://localhost:3001
```

## 測試 PDF 讀取功能

### 使用現有的 PDF 檔案測試

**在 VSCode PowerShell 終端執行：**

```powershell
# 單行版本（推薦，直接複製貼上即可）
$body = @{ tool = "read_pdf"; arguments = @{ filePath = "詹偉廷-1759913377735-238606437.pdf" } } | ConvertTo-Json; Invoke-RestMethod -Uri "http://localhost:3001/api/mcp/tool" -Method Post -ContentType "application/json" -Body $body
```

### 預期結果

應該會看到：

1. 控制台日誌顯示每頁的文字提取過程
2. API 回傳完整的 JSON 結果，包含提取的文字
3. 文字內容比之前使用 pdf-parse 時更完整、更準確

## 問題排除

### 如果容器啟動失敗

1. 檢查 Docker 日誌：
   ```powershell
   docker logs mcp-server
   ```

2. 可能的問題：
   - **Canvas 依賴安裝失敗**：確認 Dockerfile 中的系統依賴正確安裝
   - **記憶體不足**：canvas 編譯需要較多記憶體
   - **網路問題**：npm install 時可能需要下載較大的套件

### 如果文字提取仍有問題

1. 檢查 PDF 檔案本身是否為掃描檔案（圖片型 PDF）
2. 查看日誌中的文字預覽，確認是否有正確提取
3. 可以嘗試使用不同的 PDF 檔案進行測試

## 效能考量

- **記憶體使用**：pdfjs-dist 比 pdf-parse 使用更多記憶體
- **處理速度**：文字提取速度可能稍慢，但準確度更高
- **檔案大小**：Docker 映像檔會稍微大一些（因為 canvas 依賴）

## 相容性

- 與現有的 `extract_resume_info` 和 `generate_questions` 功能完全相容
- API 介面保持不變，只是內部實作改變
- 回傳的 JSON 格式更豐富，但向後相容

## 後續建議

1. 建議測試多個不同類型的 PDF 檔案
2. 觀察記憶體使用情況
3. 如果需要，可以調整文字提取的方式（例如保留更多格式資訊）

