# MCP Server - Docker 快速開始 🐳

使用 Docker 部署 MCP Server，無需安裝 Node.js 和 npm！

## 📋 前置需求

只需要安裝：
- **Docker Desktop** - [下載安裝](https://www.docker.com/products/docker-desktop/)

## 🚀 快速開始（Docker 方式）

### 步驟 1: 啟動 Docker Desktop

確保 Docker Desktop 正在運行（系統托盤應該有 Docker 圖標）

### 步驟 2: 建立並啟動容器

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
# 進入專案目錄
cd C:\dev\AITUBER\mcp-server

# 使用 docker-compose 建立並啟動（這個指令會自動安裝依賴、編譯程式碼）
docker-compose up -d --build
```

`-d` 表示背景執行，`--build` 表示重新建立映像

### 步驟 3: 驗證運行狀態

**執行環境：在 VSCode PowerShell 終端執行**

```powershell
# 查看容器狀態
docker ps

# 應該看到類似輸出：
# CONTAINER ID   IMAGE              STATUS         PORTS                    NAMES
# abc123def456   mcp-server        Up 2 minutes   0.0.0.0:3001->3001/tcp   mcp-server

# 測試健康檢查
Invoke-RestMethod -Uri http://localhost:3001/health

# 應該返回：
# status  : ok
# message : MCP Server is running
```

### 步驟 4: 查看日誌

**執行環境：在 VSCode PowerShell 終端執行**

```powershell
# 查看即時日誌
docker logs -f mcp-server

# 按 Ctrl+C 退出日誌查看
```

## 🛠️ 常用 Docker 指令

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
# 停止容器
docker-compose down

# 重新啟動容器
docker-compose restart

# 查看容器狀態
docker ps

# 查看所有容器（包括停止的）
docker ps -a

# 查看日誌
docker logs mcp-server

# 查看即時日誌
docker logs -f mcp-server

# 進入容器內部（除錯用）
docker exec -it mcp-server sh

# 重新建立並啟動（當修改程式碼後）
docker-compose up -d --build

# 完全清理（刪除容器和映像）
docker-compose down --rmi all
```

## 📊 檔案持久化

Docker 容器會自動將以下目錄映射到本地：

```yaml
volumes:
  - ./uploads:/app/uploads    # 上傳的檔案
  - ./data:/app/data          # 儲存的資料
```

這表示即使刪除容器，您的檔案和資料仍會保留在本地的 `uploads/` 和 `data/` 目錄中。

## 🔧 修改環境變數

如需修改設定，編輯 `docker-compose.yml`：

```yaml
environment:
  - NODE_ENV=production
  - PORT=3001
  - MAX_FILE_SIZE=50mb
  - ALLOWED_FILE_TYPES=.pdf,.doc,.docx,.txt
```

修改後重新啟動：

```powershell
docker-compose down
docker-compose up -d --build
```

## 🧪 測試 API

**執行環境：在 VSCode PowerShell 終端執行**

```powershell
# 健康檢查
Invoke-RestMethod -Uri http://localhost:3001/health

# 列出 MCP 工具
Invoke-RestMethod -Uri http://localhost:3001/api/mcp/tools

# 列出已上傳的檔案
Invoke-RestMethod -Uri http://localhost:3001/api/files/list
```

或使用測試腳本：

```powershell
.\scripts\test-api.ps1
```

## 🔗 與 aituber-kit 整合

### 步驟 1: 確保兩個服務都在運行

**Terminal 1（在 Docker 容器中運行 MCP Server）：**
```powershell
cd C:\dev\AITUBER\mcp-server
docker-compose up -d
```

**Terminal 2（在本地運行 aituber-kit）：**
```powershell
cd C:\dev\AITUBER\aituber-kit
npm run dev
```

### 步驟 2: 整合到 aituber-kit

詳細步驟請參考 [INTEGRATION.md](./INTEGRATION.md)

## 🐛 除錯技巧

### 容器無法啟動

```powershell
# 查看詳細錯誤
docker logs mcp-server

# 查看建立過程的輸出
docker-compose up --build
```

### 端口衝突

如果 3001 端口被佔用，修改 `docker-compose.yml`：

```yaml
ports:
  - "3002:3001"  # 將本地 3002 映射到容器的 3001
```

然後更新 aituber-kit 的環境變數：

```env
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3002
```

### 重新建立容器

```powershell
# 完全清理並重新建立
docker-compose down
docker-compose up -d --build
```

### 檔案權限問題

如果在 Windows 上遇到檔案權限問題：

```powershell
# 確保 uploads 和 data 目錄存在
New-Item -ItemType Directory -Force -Path uploads,data
```

## 📦 Docker 映像管理

```powershell
# 查看本地映像
docker images

# 刪除舊的映像（釋放空間）
docker image prune

# 查看映像大小
docker images mcp-server
```

## 🔄 更新程式碼後的流程

當您修改了 MCP Server 的程式碼：

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
# 1. 停止舊容器
docker-compose down

# 2. 重新建立映像並啟動
docker-compose up -d --build

# 3. 查看是否正常啟動
docker logs -f mcp-server
```

## ⚡ 開發模式 vs Docker 模式

### Docker 模式（推薦用於正式環境和測試）
✅ 不需要安裝 Node.js  
✅ 環境一致性高  
✅ 易於部署  
❌ 修改程式碼需要重新建立  
❌ 啟動稍慢

```powershell
docker-compose up -d --build
```

### 本地開發模式（推薦用於開發和除錯）
✅ 熱重載，修改即生效  
✅ 除錯方便  
✅ 啟動快  
❌ 需要安裝 Node.js 20+  
❌ 需要手動安裝依賴

```powershell
npm install
npm run dev
```

## 🎯 推薦工作流程

### 如果您只是使用 MCP Server（不修改程式碼）
→ 使用 **Docker 模式**

```powershell
cd C:\dev\AITUBER\mcp-server
docker-compose up -d
```

### 如果您需要開發和修改 MCP Server
→ 使用 **本地開發模式**

```powershell
cd C:\dev\AITUBER\mcp-server
npm install
npm run dev
```

## 🚀 完整啟動流程

**在 VSCode 中開啟兩個 PowerShell 終端：**

**Terminal 1 - MCP Server（Docker）：**
```powershell
cd C:\dev\AITUBER\mcp-server
docker-compose up -d
docker logs -f mcp-server
```

**Terminal 2 - aituber-kit（本地）：**
```powershell
cd C:\dev\AITUBER\aituber-kit
npm run dev
```

**在瀏覽器中：**
- 訪問 `http://localhost:3000/interview`
- 上傳履歷 PDF
- 開始個性化面試！

## 📞 需要幫助？

- 查看 [README.md](./README.md) - 完整文件
- 查看 [INTEGRATION.md](./INTEGRATION.md) - 整合指南
- 查看容器日誌：`docker logs mcp-server`

## 🎉 完成！

您的 MCP Server 現在運行在 Docker 容器中，隨時可以使用！

