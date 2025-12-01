# MCP Server - AI Tuber Kit 履歷處理服務

## 概述

MCP Server 是 AI Tuber Kit 的履歷處理服務，負責：
- PDF 履歷上傳和儲存
- 履歷內容提取（透過 OCR）
- 面試問題生成
- 面試上下文管理

## 服務架構

```
mcp-server/
├── src/                    # TypeScript 源代碼
│   ├── index.ts           # 主入口
│   ├── routes/            # API 路由
│   └── tools/             # MCP 工具
├── game-automation/       # 遊戲自動化（踩地雷）模組
│   ├── config.json        # 棋盤與辨識設定
│   ├── README.md          # 操作說明
│   └── python/            # Flask + OpenCV 後端
├── ocr-service/           # OCR 子服務
│   ├── app.py            # Flask OCR API
│   ├── Dockerfile        # OCR 容器
│   └── requirements.txt  # Python 依賴
├── uploads/               # 上傳的履歷檔案
├── data/                  # 面試資料
├── Dockerfile            # MCP 容器（生產）
├── Dockerfile.dev        # MCP 容器（開發）
└── package.json          # Node.js 依賴
```

## 在 AI Tuber Kit 中使用

### 方式 1: 與 AI Tuber Kit 一起啟動（推薦）

**📌 在 VSCode PowerShell 終端執行**

```powershell
# 在 aituber-kit 目錄下執行
cd C:\dev\AITUBER\aituber-kit

# 使用整合的設置腳本
.\scripts\setup-mcp.ps1

# 或手動啟動
docker-compose -f docker-compose.ollama.yml up -d
```

這會啟動：
- ✅ AI Tuber Kit (port 3000)
- ✅ MCP Server (port 3001)
- ✅ OCR Service (port 5000)
- ✅ Ollama, ChromaDB, n8n

### 方式 2: 僅啟動 MCP + OCR（開發用）

```powershell
cd C:\dev\AITUBER\aituber-kit

# 只啟動 MCP 和 OCR 服務
docker-compose -f docker-compose.ollama.yml up -d mcp-server ocr-service
```

## API 端點

### MCP Server (port 3001)

- `GET /health` - 健康檢查
- `POST /api/files/upload` - 上傳檔案
- `GET /api/files/list` - 列出檔案
- `POST /api/s3/sync` - 手動觸發 S3 同步（需要配置 S3_BUCKET）
- `POST /api/mcp/tool` - 調用 MCP 工具
  - `read_pdf` - 讀取 PDF（使用 OCR）
  - `extract_resume_info` - 提取履歷資訊
  - `generate_interview_questions` - 生成面試問題
  - `save_interview_context` - 儲存面試上下文
  - `get_interview_context` - 取得面試上下文
  - `automation_health` - 檢查遊戲自動化後端狀態
  - `detect_grid` - 取得踩地雷棋盤
  - `click_cell` / `flag_cell` - 操控踩地雷格子
  - `step_solve` / `autoplay` - 執行 deterministic 求解

### OCR Service (port 5000)

- `GET /health` - 健康檢查
- `POST /ocr/pdf-file` - PDF OCR（使用檔案路徑）
- `POST /ocr/pdf` - PDF OCR（上傳檔案）
- `POST /ocr/image` - 圖像 OCR

## 配置

### 環境變數

在 `.env` 中設定：

```env
# MCP Server URL（容器內通訊）
NEXT_PUBLIC_MCP_SERVER_URL=http://mcp-server:3001

# 或本地開發（直接訪問）
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001

# 遊戲自動化後端（預設指向宿主 127.0.0.1:5001）
MSW_AUTOMATION_BASE_URL=http://host.docker.internal:5001

# S3 同步配置（可選）
S3_BUCKET=your-resume-bucket
S3_REGION=ap-northeast-1
S3_PREFIX=resumes/
S3_SYNC_SCHEDULE=0 * * * *  # Cron 表達式，預設每小時
S3_DELETE_AFTER_UPLOAD=false  # 上傳到 S3 後是否刪除本地文件

# AWS 憑證（如果使用 IAM 角色可省略）
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

> 若 MCP Server 直接在宿主機上執行，可省略 `MSW_AUTOMATION_BASE_URL`，後端將使用 `http://127.0.0.1:5001`。

### S3 同步功能

MCP Server 支援自動將上傳的履歷文件同步到 AWS S3：

- **定時同步**：根據 `S3_SYNC_SCHEDULE` 設定自動同步（預設每小時）
- **手動觸發**：通過 `POST /api/s3/sync` API 手動觸發同步
- **智能去重**：自動跳過已存在的文件，避免重複上傳
- **狀態記錄**：在 `.s3-sync-state.json` 中記錄同步狀態

**Cron 表達式範例：**
- `0 * * * *` - 每小時
- `0 */6 * * *` - 每 6 小時
- `0 0 * * *` - 每天午夜
- `*/30 * * * *` - 每 30 分鐘

### OCR 設定

在 `src/tools/pdfTools.ts` 中調整：

```typescript
crop_top: '350',  // 裁切頂部像素（去除 banner）
enhance: false,   // 圖像增強（預設關閉）
dpi: '300',       // 解析度（150-600）
lang: 'chi_tra+eng+jpn'  // OCR 語言
```

## 資料持久化

### 上傳的履歷
- 位置: `mcp-server/uploads/`
- 掛載為 Docker volume

### 面試資料
- 位置: `mcp-server/data/`
- 掛載為 Docker volume

## 查看日誌

```powershell
# 所有服務
docker-compose -f docker-compose.ollama.yml logs -f

# 只看 MCP Server
docker logs mcp-server -f

# 只看 OCR Service
docker logs ocr-service -f
```

## 停止服務

```powershell
# 停止所有服務
docker-compose -f docker-compose.ollama.yml down

# 只停止 MCP 相關服務
docker-compose -f docker-compose.ollama.yml stop mcp-server ocr-service
```

## 重新建構

```powershell
# 重新建構 MCP Server
docker-compose -f docker-compose.ollama.yml up -d --build mcp-server

# 重新建構 OCR Service
docker-compose -f docker-compose.ollama.yml up -d --build ocr-service
```

## 疑難排解

### MCP Server 無法連接

```powershell
docker logs mcp-server
docker-compose -f docker-compose.ollama.yml restart mcp-server
```

### OCR 服務無法連接

```powershell
docker logs ocr-service
docker-compose -f docker-compose.ollama.yml restart ocr-service
```

### 端口衝突

如果端口被佔用，修改 `docker-compose.ollama.yml`:

```yaml
ports:
  - "3002:3001"  # 改用 3002 端口
```

## 更多文檔

- `QUICKSTART.md` - 快速開始
- `INTEGRATION.md` - 整合說明
- `OCR_SERVICE_GUIDE.md` - OCR 服務完整指南
- `PDFJS_MIGRATION.md` - PDF 解析遷移說明
