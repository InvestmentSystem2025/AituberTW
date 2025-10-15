# 測試 MCP Server 與面試系統整合

## ✅ 整合完成清單

- ✓ MCP 客戶端已建立 (`src/lib/mcpClient.ts`)
- ✓ 履歷上傳組件已建立 (`src/components/interview/ResumeUpload.tsx`)
- ✓ 面試頁面已整合履歷上傳功能
- ✓ 環境變數已配置 (`.env.local`)
- ✓ 無 linter 錯誤

## 🚀 開始測試

### 步驟 1: 啟動 MCP Server

**執行環境：在 VSCode 中開啟第一個 PowerShell 終端**

```powershell
# 進入 MCP Server 目錄
cd C:\dev\AITUBER\mcp-server

# 使用 Docker 啟動
docker-compose up -d --build

# 或使用快速啟動腳本
.\scripts\docker-start.ps1

# 查看日誌確認運行
docker logs -f mcp-server
```

**預期看到：**
```
🚀 MCP Server running on port 3001
📁 Upload directory: ./uploads
📊 Max file size: 50mb
```

**驗證 MCP Server：**
```powershell
# 在新的終端執行健康檢查
Invoke-RestMethod -Uri http://localhost:3001/health
```

**預期回應：**
```json
{
  "status": "ok",
  "message": "MCP Server is running"
}
```

### 步驟 2: 啟動 aituber-kit

**執行環境：在 VSCode 中開啟第二個 PowerShell 終端**

```powershell
# 進入 aituber-kit 目錄
cd C:\dev\AITUBER\aituber-kit

# 啟動開發伺服器
npm run dev
```

**預期看到：**
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 步驟 3: 訪問面試頁面

1. 開啟瀏覽器
2. 訪問：`http://localhost:3000/interview`
3. 按 F12 開啟開發者工具（查看 Console 輸出）

### 步驟 4: 測試履歷上傳

#### 4.1 準備測試 PDF

如果沒有測試 PDF，可以建立一個簡單的履歷：

**執行環境：在 VSCode PowerShell 終端執行**

```powershell
# 建立測試履歷文字檔
@"
張小明
軟體工程師

教育背景
國立台灣大學 資訊工程學系 學士 (2016-2020)

工作經歷
XX 科技公司 軟體工程師 (2020-2023)
- 開發 Web 應用程式
- 使用 React 和 Node.js
- 參與電商平台開發專案

專業技能
程式語言: Python, JavaScript, TypeScript
框架: React, Node.js, Express
資料庫: PostgreSQL, MongoDB
工具: Git, Docker, AWS

專案經驗
電商平台開發
- 負責前端開發
- 使用 React 和 Redux
- 提升網站效能 30%

推薦系統
- 開發協同過濾演算法
- 使用 Python 和 TensorFlow
- 提高推薦準確度 25%
"@ | Out-File -FilePath test-resume.txt -Encoding UTF8

Write-Host "✓ 測試履歷已建立: test-resume.txt" -ForegroundColor Green
Write-Host "請將此檔案轉換為 PDF 格式後使用" -ForegroundColor Yellow
```

或直接使用任何 PDF 格式的履歷檔案。

#### 4.2 上傳履歷

1. 在面試頁面的右上角找到「📄 上傳面試者履歷」組件
2. 點擊「選擇檔案」
3. 選擇您的履歷 PDF
4. 等待處理（約 5-10 秒）

#### 4.3 觀察處理過程

**在瀏覽器 Console 中應該看到：**
```
📤 上傳履歷檔案...
✓ 上傳成功: resume-1234567890.pdf
🔍 分析履歷內容...
✓ 提取成功: {education: Array(1), workExperience: Array(1), ...}
💡 生成個性化問題...
✓ 生成問題: ['我看到您在國立台灣大學...', ...]
✓ 履歷資訊已處理: {...}
✓ 生成問題: [...]
```

**在頁面上應該看到：**
- ✓ 綠色成功提示：「履歷分析完成！已生成個性化面試問題」
- 📊 履歷分析結果面板
- 顯示教育背景、工作經歷、技能等項目數量
- 💡 可展開查看生成的 5 個問題

### 步驟 5: 測試個性化面試

#### 5.1 開始面試

1. 上傳履歷後，點擊「開始面試」按鈕
2. 等待人員檢測或點擊「手動開始」
3. 面試開始

#### 5.2 觀察 AI 提問

AI 面試官應該會根據履歷內容提出個性化問題，例如：

**一般問題（未上傳履歷）：**
- "請介紹一下您自己。"
- "您有什麼工作經驗？"

**個性化問題（上傳履歷後）：**
- "我看到您在國立台灣大學資訊工程學系就讀，能否分享一下在學期間最有成就感的專案或經驗？"
- "關於您在 XX 科技公司擔任軟體工程師的經驗，這段經歷讓您獲得了什麼樣的成長？"
- "您提到具備 React 的技能，能否舉個實際運用這項技能解決問題的例子？"
- "在您的電商平台專案中，您是如何提升網站效能 30% 的？"

#### 5.3 驗證系統提示詞

**在開發者工具 Console 執行：**
```javascript
// 查看當前系統提示詞
console.log(localStorage.getItem('systemPrompt'))
```

應該會看到包含履歷資訊的提示詞，例如：
```
你是一位專業且友善的 AI 面試官。以下是面試者的背景資訊：

【教育背景】
國立台灣大學 資訊工程學系 學士 (2016-2020)

【工作經歷】
XX 科技公司 軟體工程師 (2020-2023)
...
```

## 🔍 測試檢查清單

完成以下檢查項目：

### MCP Server 測試

- [ ] MCP Server 成功啟動（Docker 容器運行中）
- [ ] 健康檢查返回 `"status": "ok"`
- [ ] 可以訪問 http://localhost:3001/health
- [ ] Docker 日誌沒有錯誤

### aituber-kit 測試

- [ ] aituber-kit 成功啟動
- [ ] 可以訪問 http://localhost:3000/interview
- [ ] 頁面正常載入，沒有 JavaScript 錯誤
- [ ] 可以看到面試介面

### 履歷上傳測試

- [ ] 可以看到「📄 上傳面試者履歷」組件（右上角）
- [ ] 點擊可以選擇檔案
- [ ] 上傳 PDF 成功
- [ ] 看到「正在連接 MCP Server...」提示
- [ ] 看到「正在上傳履歷...」提示
- [ ] 看到「正在分析履歷內容...」提示
- [ ] 看到「正在生成面試問題...」提示
- [ ] 看到「✓ 履歷分析完成！已生成個性化面試問題」

### 履歷分析測試

- [ ] 顯示「📊 履歷分析結果」面板
- [ ] 顯示教育背景項目數
- [ ] 顯示工作經歷項目數
- [ ] 顯示專業技能項目數
- [ ] 顯示生成的問題數量
- [ ] 可以展開查看生成的問題
- [ ] 問題與履歷內容相關

### 個性化面試測試

- [ ] 開始面試後 AI 提出問題
- [ ] AI 的問題與履歷內容相關
- [ ] AI 提到履歷中的具體資訊（學校、公司、技能等）
- [ ] AI 的問題有深度和針對性
- [ ] 可以正常進行對話

### 錯誤處理測試

- [ ] 上傳非 PDF 檔案顯示錯誤訊息
- [ ] 上傳超大檔案（>10MB）顯示錯誤訊息
- [ ] MCP Server 未運行時顯示適當錯誤
- [ ] 可以重新上傳履歷

## 🐛 常見問題解決

### 問題 1: 上傳後提示「MCP Server 未運行」

**解決方案：**
```powershell
# 檢查 MCP Server 是否運行
docker ps | Select-String "mcp-server"

# 如果沒有運行，啟動它
cd C:\dev\AITUBER\mcp-server
docker-compose up -d

# 查看日誌
docker logs -f mcp-server
```

### 問題 2: CORS 錯誤

**解決方案：**

檢查 MCP Server 的 docker-compose.yml：
```yaml
environment:
  - ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

重新啟動：
```powershell
docker-compose down
docker-compose up -d --build
```

### 問題 3: PDF 分析沒有結果

**可能原因：**
- PDF 是掃描檔（圖片型），不是文字型
- PDF 格式不標準
- PDF 內容是圖片

**解決方案：**
1. 使用文字型 PDF
2. 查看 MCP Server 日誌了解詳細錯誤
3. 嘗試其他 PDF 檔案

### 問題 4: 生成的問題不夠個性化

**可能原因：**
- 履歷資訊提取不完整
- 履歷內容較少

**查看提取結果：**
```powershell
# 在 MCP Server 終端查看
docker logs mcp-server | Select-String "resumeInfo"
```

**改進建議：**
- 使用內容更豐富的履歷
- 確保履歷格式標準（有明確的章節標題）

## 📊 測試數據範例

### 成功案例

**履歷內容：**
- 教育：1 項
- 工作經歷：2 項
- 技能：8 項
- 專案：2 項

**生成問題：**
```
1. 我看到您在國立台灣大學資訊工程學系就讀，能否分享一下在學期間最有成就感的專案或經驗？
2. 關於您在 XX 科技公司擔任軟體工程師的經驗，這段經歷讓您獲得了什麼樣的成長？
3. 您從資料分析師轉換到軟體工程師的動機是什麼？
4. 您提到具備 React 的技能，能否舉個實際運用這項技能解決問題的例子？
5. 在您的電商平台專案中，遇到最大的挑戰是什麼？您是如何克服的？
```

**AI 面試對話：**
```
AI: 您好！歡迎參加面試。我看到您在國立台灣大學資訊工程學系就讀，能否分享一下在學期間最有成就感的專案或經驗？

候選人: [回答]

AI: 很棒的經驗！我注意到您在 XX 科技公司擔任軟體工程師，這段經歷讓您獲得了什麼樣的成長？

候選人: [回答]

AI: 非常好。您提到具備 React 的技能，能否舉個實際運用這項技能解決問題的例子？
```

## ✅ 測試完成標準

當您完成以下所有項目，表示整合測試成功：

1. ✓ MCP Server 正常運行
2. ✓ 可以成功上傳 PDF 履歷
3. ✓ 系統正確分析履歷內容
4. ✓ 生成 5 個個性化問題
5. ✓ AI 面試官提出與履歷相關的問題
6. ✓ 問題提到具體的學校、公司、技能等資訊
7. ✓ 整個流程順暢無錯誤

## 🎉 測試成功！

恭喜！您已成功整合 MCP Server 與面試系統。

現在您可以：
- 上傳面試者履歷進行個性化面試
- 根據履歷內容自動生成問題
- 進行更有針對性的面試評估

享受您的 AI 面試系統！


