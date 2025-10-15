# OCR 面試流程整合完成

## ✅ 已完成的功能

### 1. OCR 服務整合
- ✅ 建立獨立的 OCR 服務容器（使用 Tesseract）
- ✅ 支援 PDF 轉圖像 + OCR 文字識別
- ✅ 裁切功能去除 PDF banner（預設裁切頂部 350px）
- ✅ 圖像預處理功能（可選）
- ✅ MCP Server 自動調用 OCR 服務

### 2. 履歷上傳流程
**流程**：上傳 PDF → OCR 識別 → 提取履歷資訊 → 生成面試問題 → **預先生成 AI 問候語** → 準備完成

**技術實作**：
- `ResumeUpload.tsx`: 處理上傳、調用 MCP、生成 AI 問候語
- `mcpClient.ts`: 與 MCP Server 通訊
- MCP `pdfTools.ts`: 調用 OCR 服務進行 PDF 文字提取

### 3. AI 問候語預生成
- ✅ 上傳履歷後自動調用 AI 生成個性化問候語
- ✅ 問候語基於履歷內容（教育背景、工作經歷、技能）
- ✅ 儲存在 interview.tsx 的 state 中
- ✅ 點擊「開始面試」後立即顯示（無需等待）

### 4. System Prompt 增強
履歷資訊會自動整合到 system prompt，包含：
- 教育背景
- 工作經歷
- 專業技能
- 專案經驗
- 證照認證
- 建議問題方向

---

## 🚀 完整流程

### 步驟 1: 啟動服務

**📌 在 VSCode PowerShell 終端執行**

```powershell
# 啟動 MCP Server（包含 OCR 服務）
cd C:\dev\AITUBER\mcp-server
docker-compose -f docker-compose.dev.yml up -d

# 確認服務運行
docker-compose -f docker-compose.dev.yml ps

# 啟動 AI Tuber Kit
cd C:\dev\AITUBER\aituber-kit
npm run dev
```

### 步驟 2: 進入面試模式

1. 打開瀏覽器訪問 `http://localhost:3000/interview`
2. 系統會啟動人員檢測
3. 在右上角上傳履歷 PDF

### 步驟 3: 履歷處理（自動）

系統會自動執行：
1. **上傳 PDF** 到 MCP Server
2. **OCR 識別** PDF 內容（裁切 banner、文字提取）
3. **提取履歷資訊**（教育、工作、技能等）
4. **生成面試問題**（基於履歷內容）
5. **更新 System Prompt**（包含履歷資訊）
6. **預先生成 AI 問候語**（個性化歡迎詞）

### 步驟 4: 開始面試

1. 點擊「手動開始面試」按鈕
2. **立即顯示預先生成的 AI 問候語**（無需等待）
3. AI 基於履歷內容進行個性化面試
4. 面試過程中所有對話都參考履歷資訊

---

## 🔧 技術架構

```
Frontend (aituber-kit)
    ↓
    ├─ ResumeUpload.tsx
    │   ├─ 1. 上傳 PDF
    │   ├─ 2. 調用 mcpClient.processResume()
    │   ├─ 3. 生成 AI 問候語 (getVercelAIChatResponse)
    │   └─ 4. 通知 interview.tsx
    │
    └─ interview.tsx
        ├─ 儲存履歷資料 + AI 問候語
        └─ 傳遞給 InterviewInterface
            └─ 開始面試時立即顯示問候語

Backend (mcp-server)
    ↓
    ├─ MCP Server (Node.js)
    │   ├─ /api/files/upload - 接收 PDF
    │   └─ /api/mcp/tool - 處理工具調用
    │       ├─ extract_resume_info
    │       ├─ generate_interview_questions
    │       └─ read_pdf → 調用 OCR
    │
    └─ OCR Service (Python + Flask)
        ├─ /ocr/pdf-file - PDF OCR 處理
        ├─ Tesseract OCR 識別
        └─ 支援裁切、圖像預處理
```

---

## 📝 關鍵檔案

### Frontend
- `src/pages/interview.tsx` - 面試主頁面，管理履歷資料和問候語
- `src/components/interview/ResumeUpload.tsx` - 履歷上傳和 AI 問候語生成
- `src/components/interview/InterviewInterface.tsx` - 面試界面，顯示問候語
- `src/lib/mcpClient.ts` - MCP 客戶端

### Backend (MCP Server)
- `src/tools/pdfTools.ts` - PDF 讀取（調用 OCR）
- `src/tools/resumeTools.ts` - 履歷資訊提取和問題生成
- `docker-compose.dev.yml` - 服務配置

### Backend (OCR Service)
- `ocr-service/app.py` - OCR API 服務
- `ocr-service/Dockerfile` - OCR 容器配置

---

## 🎯 OCR 設定

### 裁切設定（去除 banner）
在 `mcp-server/src/tools/pdfTools.ts`:
```typescript
crop_top: '350',  // 裁切頂部 350 像素
```

### 調整裁切值
如果需要調整：
1. 修改 `src/tools/pdfTools.ts` 中的 `crop_top` 值
2. 重啟 MCP Server：
```powershell
docker-compose -f docker-compose.dev.yml restart mcp-server-dev
```

### 圖像增強（預設關閉）
如需啟用：
```typescript
enhance: true  // 啟用圖像預處理
```

---

## ✅ 測試流程

### 📌 在 VSCode PowerShell 終端執行

```powershell
# 1. 確認 MCP Server 運行
Invoke-RestMethod -Uri "http://localhost:3001/health"

# 2. 確認 OCR 服務運行
Invoke-RestMethod -Uri "http://localhost:5000/health"

# 3. 測試 OCR（可選）
$body = @{ 
    filePath = "your-resume.pdf"
    lang = "chi_tra+eng+jpn"
    dpi = "300"
    crop_top = "350"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/ocr/pdf-file" `
    -Method Post `
    -ContentType "application/json" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

### 完整測試
1. 訪問 `http://localhost:3000/interview`
2. 上傳測試 PDF
3. 觀察 Console 日誌：
   - ✓ 上傳成功
   - ✓ 提取成功
   - ✓ 生成問題
   - ✓ AI 問候語已準備
4. 點擊「手動開始面試」
5. 確認立即顯示 AI 問候語

---

## 🐛 問題排除

### MCP Server 無法連接
```powershell
docker logs mcp-server-dev
docker-compose -f docker-compose.dev.yml restart
```

### OCR 服務無法連接
```powershell
docker logs ocr-service
docker-compose -f docker-compose.dev.yml restart ocr-service
```

### AI 問候語未生成
檢查瀏覽器 Console：
- 是否有 API 錯誤？
- AI API Key 是否正確設定？
- 檢查 settingsStore 中的 AI 服務配置

### OCR 識別不準確
1. 調整裁切值（`crop_top`）
2. 檢查 PDF 品質
3. 嘗試提高 DPI（300 → 600）
4. 啟用圖像增強（`enhance: true`）

---

## 📊 效能考量

- **首次 OCR 建構**: 5-10 分鐘（下載 Tesseract）
- **PDF 上傳**: < 1 秒
- **OCR 處理**: 2-5 秒（視 PDF 大小）
- **AI 問候語生成**: 2-3 秒
- **總處理時間**: 約 5-10 秒

---

## 🎉 優勢

1. **無需等待** - AI 問候語預先生成，點擊開始立即顯示
2. **個性化** - 基於履歷內容的專屬面試
3. **準確識別** - OCR 服務比 pdfjs-dist 更準確
4. **易於調整** - 裁切和 OCR 參數可彈性設定
5. **獨立服務** - OCR 服務可單獨擴展和優化

---

**整合完成日期**: 2025-10-14  
**版本**: v1.0.0-ocr-integration


