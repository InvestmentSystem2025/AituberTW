## AITuberKit 快速安裝與一鍵啟動（Docker + Ollama）

本文件提供團隊新人可一鍵完成本專案開發環境的指引，包含：Ollama 模型下載、Embedding 模型下載、ChromaDB、n8n（手動匯入工作流程），以及應用啟動與測試方式。

參考並整合了既有文件與腳本：`docker-compose.ollama.yml`、`scripts/*`、`docs/*`、`README_OLD.md`。

---

### 前置需求

- Docker Desktop（Windows 建議啟用 WSL2）
- PowerShell（Windows，建議在 VSCode 內使用）
- 建議配備 NVIDIA GPU（`docker-compose.ollama.yml` 預設啟用 GPU）。若無 GPU，請參考「疑難排解」調整為 CPU 模式。

---

### 一鍵安裝（建議優先使用）

- 執行環境：VSCode PowerShell 終端（不是在 Docker 容器內）

1) 允許腳本執行（若第一次執行 PowerShell 腳本）

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

2) 一鍵啟動（預設會下載聊天與嵌入模型，並啟動所有服務）

```powershell
./scripts/setup-all.ps1
```

可選參數：

- 跳過測試：

```powershell
./scripts/setup-all.ps1 -SkipTests
```

- 不啟動 n8n：

```powershell
./scripts/setup-all.ps1 -SkipN8N
```

- 指定模型：

```powershell
./scripts/setup-all.ps1 -ChatModel "gpt-oss:20b" -EmbeddingModel "jeffh/intfloat-multilingual-e5-large-instruct:f16"
```

腳本會執行：

- 檢查 Docker 是否運作
- 檢查/建立 `.env`（若有 `.env.example` 會自動複製）
- 以 `docker-compose.ollama.yml` 啟動 `ollama`、`chromadb`、`n8n`、`app`
- 等待各服務就緒（11434/8000/5678/3000）
- 下載/確認聊天模型與 Embedding 模型
- 可選執行驗證測試（`test-ollama.ps1`、`test-embedding.ps1`、`test-integration.ps1`）

---

### 手動步驟（必要時）

- 執行環境：VSCode PowerShell 終端（不是在 Docker 容器內）

1) 安裝依賴並啟動核心服務（Ollama + ChromaDB）

```powershell
docker compose -f docker-compose.ollama.yml up -d ollama chromadb
# 若舊版 Docker：docker-compose -f docker-compose.ollama.yml up -d ollama chromadb
```

2) 下載聊天模型與嵌入模型（在容器內執行）

- 執行環境：Docker 容器內（`ollama`）

```powershell
docker exec ollama ollama pull gpt-oss:20b
docker exec ollama ollama pull jeffh/intfloat-multilingual-e5-large-instruct:f16
```

3) 啟動 n8n（可選）與主應用

```powershell
docker compose -f docker-compose.ollama.yml up -d n8n app
```

4) 檢查服務健康狀態

```powershell
docker compose -f docker-compose.ollama.yml ps
docker logs ollama
docker logs chromadb
docker logs app
docker logs n8n
```

---

### 環境變數

一鍵腳本會自動建立最小化 `.env`（或從 `.env.example` 複製）。關鍵變數如下：

```
OLLAMA_BASE_URL=http://ollama:11434
CHROMA_URL=http://chromadb:8000
OLLAMA_EMBEDDING_MODEL=jeffh/intfloat-multilingual-e5-large-instruct:f16
```

若需自訂模型，可於執行 `setup-all.ps1` 時帶入參數，或修改 `.env`/`docker-compose.ollama.yml`。

---

### 驗證與測試

- 執行環境：VSCode PowerShell 終端（不是在 Docker 容器內）

1) 測試 Ollama（列出模型、對話、串流）

```powershell
./scripts/test-ollama.ps1
```

2) 測試 Embedding（多語、維度、效能）

```powershell
./scripts/test-embedding.ps1
```

3) 整合測試（聊天 + 嵌入 + 併發 + 應用健康檢查）

```powershell
./scripts/test-integration.ps1
```

4) 瀏覽器測試頁面（執行環境：瀏覽器）

- `http://localhost:3000/test-embedding-manual.html`
- `http://localhost:3000/test-rag-integration.html`
- `http://localhost:3000/test-news.html`

---

### n8n 手動設定（RSS 新聞自動化）

- 執行環境：瀏覽器（管理介面），VSCode PowerShell（啟動/檢查）

1) 確認 n8n 已啟動：

```powershell
docker compose -f docker-compose.ollama.yml up -d n8n
```

2) 開啟 `http://localhost:5678`，於 UI 匯入：`n8n-workflows/RSS_News_Automation.json`

3) 依需求調整 RSS 來源（`n8n-workflows/RSS_Sources.md`），啟用工作流程並測試。

補充腳本：

```powershell
# 快速啟動與基本檢查
./scripts/setup-n8n.ps1

# 等待 n8n 就緒並測試新聞 API 串接
./scripts/setup-n8n-workflow.ps1
```

---

### RAG（檢索增強生成）

- 主要服務：ChromaDB（`http://localhost:8000`）
- 相關指南：`docs/rag-integration-guide.md`

快速檢查 ChromaDB 心跳（執行環境：VSCode PowerShell）：

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/heartbeat" -Method Get
```

若需加入示例文件或進一步檢查，可參考：

```powershell
./scripts/setup-rag.ps1
```

---

### 常見問題與疑難排解

- 服務啟動失敗或逾時：
  - 檢查 Docker 是否運作、記憶體分配（建議 ≥ 8GB）
  - 查看日誌：`docker logs ollama`、`docker logs chromadb`、`docker logs app`、`docker logs n8n`
  - 重新啟動：`docker compose -f docker-compose.ollama.yml restart`

- 模型下載很慢或失敗：
  - 重試：`docker exec ollama ollama pull gpt-oss:20b`
  - 先確認網路與可用空間（建議 ≥ 20GB）

- GPU 相關錯誤：
  - 確認安裝 NVIDIA 驅動與 Docker Desktop 的 GPU 支援（Windows 需 WSL2）
  - 無 GPU 環境可改 CPU：在 `docker-compose.ollama.yml` 移除 `gpus` 與 `nvidia` 相關設定，並刪除 `CUDA_VISIBLE_DEVICES`、`NVIDIA_VISIBLE_DEVICES`

- 埠號衝突：
  - 調整 `docker-compose.ollama.yml` 中對應 `ports` 對映

---

### 重要連結與授權

- 架構與詳細文件：`docs/README_zh.md`、`docs/ollama-setup-guide.md`、`docs/rag-integration-guide.md`
- 進階功能：`public/test-rag-integration.html`、`public/test-embedding-manual.html`
- 授權與條款：`docs/license.md`、`docs/logo_licence.md`、`docs/character_model_licence.md`

---

### 開發者常用指令（全在 VSCode PowerShell 執行）

```powershell
# 啟動全部（含 n8n）
docker compose -f docker-compose.ollama.yml up -d

# 停止並移除
docker compose -f docker-compose.ollama.yml down

# 僅啟動 app
docker compose -f docker-compose.ollama.yml up -d app

# 查看狀態 / 日誌
docker compose -f docker-compose.ollama.yml ps
docker logs app

# 重新建置 app（若修改 Dockerfile 或依賴）
docker compose -f docker-compose.ollama.yml build app
docker compose -f docker-compose.ollama.yml up -d app
```

---

如有缺漏或需要新增自動化步驟，請先提出 Issue 或 PR；本 README 將隨腳本更新持續完善。


