# MCP Server 與 aituber-kit 整合完成指南

## ✅ 已完成的整合

### 1. 建立的檔案

- **`src/lib/mcpClient.ts`** - MCP Server 客戶端，處理所有與 MCP Server 的通訊
- **`src/components/interview/ResumeUpload.tsx`** - 履歷上傳組件
- **`.env.local`** - 環境變數配置

### 2. 修改的檔案

- **`src/pages/interview.tsx`** - 整合履歷上傳功能到面試頁面

## 🚀 啟動服務

### 步驟 1: 啟動 MCP Server

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
cd C:\dev\AITUBER\mcp-server

# 使用 Docker 啟動（推薦）
.\scripts\docker-start.ps1

# 或使用 docker-compose
docker-compose up -d --build

# 查看日誌確認運行
docker logs -f mcp-server
```

等待看到以下訊息：
```
🚀 MCP Server running on port 3001
📁 Upload directory: ./uploads
📊 Max file size: 50mb
```

### 步驟 2: 啟動 aituber-kit

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\aituber-kit`）**

```powershell
cd C:\dev\AITUBER\aituber-kit

# 啟動開發伺服器
npm run dev
```

等待看到：
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

## 🧪 測試面試功能

### 1. 開啟面試頁面

在瀏覽器中訪問：`http://localhost:3000/interview`

### 2. 上傳履歷

1. 在右上角看到「📄 上傳面試者履歷」組件
2. 點擊「選擇檔案」上傳 PDF 格式的履歷
3. 系統會自動：
   - ✅ 上傳檔案到 MCP Server
   - ✅ 分析履歷內容（教育背景、工作經歷、技能等）
   - ✅ 生成 5 個個性化面試問題
   - ✅ 更新 AI 面試官的系統提示詞

### 3. 查看分析結果

上傳成功後，會顯示：
- 📊 履歷分析結果
- 🎓 教育背景（X 項）
- 💼 工作經歷（X 項）
- ⚡ 專業技能（X 項）
- 💡 生成的個性化問題（可展開查看）

### 4. 開始面試

1. 點擊「開始面試」
2. AI 面試官會根據履歷內容提出個性化問題
3. 例如：
   - "您在 XX 大學有製作過相關的專案嗎？請分享一下經驗。"
   - "您上一份 XX 工作讓您獲得了什麼樣的成長？"
   - "關於您提到的 XX 技能，能否舉個實際運用的例子？"

## 📋 功能說明

### MCP Server 提供的功能

1. **PDF 讀取** - 讀取並解析 PDF 檔案內容
2. **履歷分析** - 提取教育背景、工作經歷、技能、專案、證照
3. **問題生成** - 根據履歷內容生成個性化面試問題
4. **檔案管理** - 上傳、列表、刪除檔案
5. **上下文儲存** - 儲存面試相關資訊

### 面試流程

```
1. 上傳履歷 PDF
   ↓
2. MCP Server 分析履歷
   ↓
3. 生成個性化問題
   ↓
4. 更新 AI 系統提示詞
   ↓
5. 開始個性化面試
   ↓
6. AI 根據履歷提問
```

## 🔍 除錯指南

### 問題 1: 無法上傳履歷

**檢查步驟：**

```powershell
# 1. 確認 MCP Server 是否運行
docker ps

# 2. 測試 MCP Server 健康狀態
Invoke-RestMethod -Uri http://localhost:3001/health

# 3. 查看 MCP Server 日誌
docker logs -f mcp-server
```

**預期結果：**
```json
{
  "status": "ok",
  "message": "MCP Server is running"
}
```

### 問題 2: 上傳後沒有反應

**檢查步驟：**

1. 打開瀏覽器開發者工具（F12）
2. 查看 Console 標籤是否有錯誤
3. 查看 Network 標籤的 API 請求

常見錯誤：
- CORS 錯誤 → 確認 MCP Server 的 `ALLOWED_ORIGINS` 設定
- 404 錯誤 → 確認 MCP Server 正在運行
- 500 錯誤 → 查看 MCP Server 日誌

### 問題 3: PDF 分析失敗

**可能原因：**

1. PDF 是掃描檔（圖片型），非文字型
   - **解決方案**：使用 OCR 處理或提供文字型 PDF

2. PDF 檔案損壞
   - **解決方案**：嘗試其他 PDF 檔案

3. PDF 格式特殊
   - **解決方案**：查看 MCP Server 日誌了解詳細錯誤

## 🎯 個性化問題範例

### 範例 1：軟體工程師履歷

**履歷內容：**
- 教育：國立台灣大學 資訊工程學系
- 工作：XX 科技公司 軟體工程師
- 技能：Python, JavaScript, React

**生成的問題：**
1. "我看到您在國立台灣大學資訊工程學系就讀，能否分享一下在學期間最有成就感的專案或經驗？"
2. "關於您在 XX 科技公司擔任軟體工程師的經驗，這段經歷讓您獲得了什麼樣的成長？"
3. "您提到具備 React 的技能，能否舉個實際運用這項技能解決問題的例子？"
4. "在您的專案經驗中，遇到最大的挑戰是什麼？您是如何克服的？"
5. "您認為自己最大的優勢是什麼？"

### 範例 2：資料科學家履歷

**履歷內容：**
- 教育：碩士 資料科學
- 工作：資料分析師 → 資料科學家
- 技能：Python, R, Machine Learning
- 專案：推薦系統、預測模型

**生成的問題：**
1. "我看到您擁有資料科學碩士學位，能否分享一下在學期間最有成就感的研究或專案？"
2. "您從資料分析師轉換到資料科學家的動機是什麼？"
3. "您提到具備機器學習的技能，能否舉個實際運用這項技能解決問題的例子？"
4. "在您的推薦系統專案中，遇到最大的挑戰是什麼？您是如何克服的？"
5. "未來三到五年，您對自己的職業發展有什麼規劃？"

## 📊 系統架構

```
┌─────────────────┐         ┌─────────────────┐
│  aituber-kit    │         │   MCP Server    │
│  (Port 3000)    │◄───────►│   (Port 3001)   │
│                 │         │                 │
│ - 面試頁面      │         │ - PDF 讀取      │
│ - 履歷上傳      │         │ - 履歷分析      │
│ - AI 對話       │         │ - 問題生成      │
│                 │         │ - 檔案管理      │
└─────────────────┘         └─────────────────┘
        │                           │
        │                           │
        ▼                           ▼
   瀏覽器介面                  Docker 容器
```

## 🔧 環境變數

### aituber-kit (.env.local)

```env
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001
```

### MCP Server (.env)

```env
PORT=3001
NODE_ENV=production
MAX_FILE_SIZE=50mb
UPLOAD_DIR=./uploads
ALLOWED_FILE_TYPES=.pdf,.doc,.docx,.txt
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
DATA_DIR=./data
```

## 📝 測試清單

- [ ] MCP Server 成功啟動
- [ ] aituber-kit 成功啟動
- [ ] 可以訪問 http://localhost:3000/interview
- [ ] 可以看到履歷上傳組件
- [ ] 可以成功上傳 PDF 檔案
- [ ] 系統顯示履歷分析結果
- [ ] 可以查看生成的問題
- [ ] 開始面試後 AI 提出個性化問題
- [ ] AI 的問題與履歷內容相關

## 🎉 完成！

現在您的面試系統已經整合了 MCP Server，可以：
- 📄 上傳面試者履歷
- 🧠 自動分析履歷內容
- 💡 生成個性化問題
- 🎯 進行針對性面試

祝您使用愉快！


