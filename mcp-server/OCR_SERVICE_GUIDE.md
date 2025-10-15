# OCR 服務整合指南

## 概述

新增了獨立的 OCR 服務容器，用於處理無法用 pdfjs-dist 正確提取文字的 PDF 檔案。

## 架構

```
mcp-server/
├── ocr-service/              # OCR 服務目錄
│   ├── Dockerfile           # OCR 容器配置
│   ├── app.py              # Flask API 服務
│   ├── requirements.txt    # Python 依賴
│   └── README.md          # OCR 服務說明
├── docker-compose.dev.yml  # 開發環境配置（包含兩個服務）
└── uploads/                # 共享上傳目錄
```

## 服務說明

### OCR Service
- **容器名稱**: `ocr-service`
- **端口**: `5000`
- **功能**: PDF → 圖像 → OCR 文字提取
- **支援語言**: 繁中、簡中、英文、日文

### MCP Server
- **容器名稱**: `mcp-server-dev`
- **端口**: `3001`
- **功能**: 檔案管理、MCP 工具、履歷解析
- **可呼叫**: OCR 服務進行文字提取

## 啟動服務

### 📌 執行環境：在 VSCode PowerShell 終端執行

```powershell
cd C:\dev\AITUBER\mcp-server

# 停止舊服務
docker-compose -f docker-compose.dev.yml down

# 建構並啟動兩個服務
docker-compose -f docker-compose.dev.yml up -d --build

# 查看日誌
docker-compose -f docker-compose.dev.yml logs -f
```

**注意**：首次建構 OCR 服務需要 5-10 分鐘（下載 Tesseract 和語言包）

## 驗證服務

### 1. 檢查容器狀態

```powershell
docker-compose -f docker-compose.dev.yml ps
```

應該看到兩個服務都是 `Up` 狀態：
- `mcp-server-dev`
- `ocr-service`

### 2. 測試 OCR 服務健康檢查

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

預期回應：
```json
{
  "status": "ok",
  "service": "OCR Service",
  "tesseract_version": "5.x.x"
}
```

### 3. 測試 PDF OCR

```powershell
# 準備測試檔案
$pdfPath = "C:\dev\AITUBER\mcp-server\uploads\詹偉廷-1759913377735-238606437.pdf"

# 創建 multipart/form-data 請求
$form = @{
    file = Get-Item -Path $pdfPath
    lang = 'chi_tra+eng+jpn'
    dpi = '300'
}

# 發送請求
$response = Invoke-RestMethod -Uri "http://localhost:5000/ocr/pdf" -Method Post -Form $form

# 查看結果
Write-Host "========== PDF 轉圖像結果 ==========" -ForegroundColor Green
$response.conversion | ConvertTo-Json

Write-Host "`n========== OCR 文字提取結果 ==========" -ForegroundColor Green
$response.ocr.full_text

Write-Host "`n========== 統計資訊 ==========" -ForegroundColor Green
Write-Host "總頁數: $($response.ocr.total_pages)"
Write-Host "總字符數: $($response.ocr.total_chars)"
```

## API 端點

### 健康檢查
```
GET http://localhost:5000/health
```

### PDF OCR
```
POST http://localhost:5000/ocr/pdf
Content-Type: multipart/form-data

參數：
- file: PDF 文件（必需）
- lang: 語言代碼（選填，預設 'chi_tra+eng+jpn'）
- dpi: 解析度（選填，預設 300，範圍 150-600）
```

**回應格式**：
```json
{
  "success": true,
  "conversion": {
    "success": true,
    "page_count": 4,
    "dpi": 300,
    "message": "PDF 成功轉換為 4 張圖像"
  },
  "ocr": {
    "total_pages": 4,
    "language": "chi_tra+eng+jpn",
    "full_text": "完整的文字內容...",
    "pages": [
      {
        "page": 1,
        "text": "第一頁的文字...",
        "char_count": 500
      }
    ],
    "total_chars": 2000
  }
}
```

### 圖像 OCR
```
POST http://localhost:5000/ocr/image
Content-Type: multipart/form-data

參數：
- file: 圖像文件（必需）
- lang: 語言代碼（選填）
```

## 支援的語言

| 代碼 | 語言 |
|------|------|
| `chi_tra` | 繁體中文 |
| `chi_sim` | 簡體中文 |
| `jpn` | 日文 |
| `eng` | 英文 |

**組合使用**：使用 `+` 連接，例如 `chi_tra+eng+jpn`

## 容器間通訊

兩個服務在同一個 Docker 網絡 (`aituber-kit_default`) 中：

- **從 MCP Server 呼叫 OCR**：
  ```
  http://ocr-service:5000/ocr/pdf
  ```

- **從外部（主機）呼叫**：
  ```
  http://localhost:5000/ocr/pdf
  ```

## 效能調整

### DPI 設定
- **150**: 快速，適合純文字
- **300**: 平衡（預設）
- **600**: 高品質，適合小字或模糊文字

### 語言選擇
- 只選擇必要的語言可提升速度
- 例如：純英文使用 `eng`，純中文使用 `chi_tra`

## 問題排除

### OCR 服務啟動失敗

```powershell
# 查看詳細日誌
docker logs ocr-service

# 常見問題：Tesseract 未正確安裝
docker exec ocr-service tesseract --version
```

### 記憶體不足

OCR 處理高解析度 PDF 需要較多記憶體：
- 建議 Docker 分配至少 4GB 記憶體
- 可降低 DPI 來減少記憶體使用

### 文字識別不準確

1. **提高 DPI**：從 300 提高到 600
2. **調整語言**：確保選擇正確的語言組合
3. **檢查原始 PDF**：可能是掃描品質問題

## 日誌查看

```powershell
# 查看 OCR 服務日誌
docker logs ocr-service -f

# 查看所有服務日誌
docker-compose -f docker-compose.dev.yml logs -f

# 只查看 MCP 服務日誌
docker logs mcp-server-dev -f
```

## 停止服務

```powershell
# 停止所有服務
docker-compose -f docker-compose.dev.yml down

# 只重啟 OCR 服務
docker-compose -f docker-compose.dev.yml restart ocr-service

# 只重啟 MCP 服務
docker-compose -f docker-compose.dev.yml restart mcp-server-dev
```

## 下一步

整合 OCR 服務到 MCP 的 PDF 讀取工具，請參考 `INTEGRATION.md`。


