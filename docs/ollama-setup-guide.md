# Ollama 與 RAG 設置指南

## 步驟 1：Ollama 與 gpt-oss:20 模型設置

### 前置需求
- Docker Desktop 已安裝並運行
- Windows PowerShell
- 至少 20GB 可用硬碟空間（用於模型下載）

### 安裝步驟

#### 1. 創建環境變數檔案
在專案根目錄創建 `.env` 檔案，內容如下：
```env
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:20

# ChromaDB Configuration
CHROMA_URL=http://localhost:8000
```

#### 2. 啟動服務
**在 VSCode 的 PowerShell 終端執行**（不是在 Docker 內）：

1. 開啟 VSCode 終端（Ctrl + `）
2. 確認在專案根目錄
3. 執行腳本：

```powershell
# 執行設置腳本（在 VSCode PowerShell 終端）
.\scripts\setup-ollama.ps1
```

如果遇到執行權限問題：
```powershell
# 允許執行 PowerShell 腳本
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

這個腳本會：
- 啟動 Ollama 容器
- 啟動 ChromaDB 容器
- 自動下載 gpt-oss:20 模型
- 測試 API 連接
- 啟動主應用

#### 3. 驗證安裝
**在 VSCode 的 PowerShell 終端執行**測試腳本：
```powershell
# 在 VSCode PowerShell 終端執行（不是 Docker 內）
.\scripts\test-ollama.ps1
```

成功的測試應該顯示：
- ✓ Ollama 服務連接成功
- ✓ 模型回應成功
- ✓ 串流模式測試成功
- ✓ 應用 API 整合成功

### 在應用中使用

1. 訪問 http://localhost:3000
2. 進入設置頁面
3. 在 "AI Service" 中選擇 "ollama"
4. 在 "Model" 中輸入 "gpt-oss:20b"
5. 在 "Local LLM URL" 中輸入 "http://ollama:11434" （容器網路）
6. 保存設置

**重要提醒**：在 Docker 環境中，必須使用 `http://ollama:11434` 而不是 `http://localhost:11434`

### 測試聊天功能

在聊天輸入框中輸入任何問題，例如：
- "你好，請介紹一下自己"
- "今天天氣如何？"
- "最近有什麼新聞？"

如果收到回應，表示步驟 1 設置成功！

### 常見問題

#### Q: Docker 容器無法啟動
A: 確保 Docker Desktop 正在運行，並且有足夠的記憶體分配（建議至少 8GB）

#### Q: 模型下載失敗
A: 手動下載模型：
```powershell
docker exec -it ollama bash
ollama pull gpt-oss:20
```

#### Q: 連接被拒絕
A: 檢查防火牆設置，確保端口 11434 和 8000 未被封鎖

#### Q: 記憶體不足
A: 調整 Docker Desktop 的記憶體限制，或使用較小的模型

### 管理命令

查看容器狀態：
```powershell
docker-compose -f docker-compose.ollama.yml ps
```

查看日誌：
```powershell
docker-compose -f docker-compose.ollama.yml logs ollama
```

停止服務：
```powershell
docker-compose -f docker-compose.ollama.yml down
```

重啟服務：
```powershell
docker-compose -f docker-compose.ollama.yml restart
```

### 下一步

完成步驟 1 後，請通知我進行步驟 2：配置 Embedding 模型
