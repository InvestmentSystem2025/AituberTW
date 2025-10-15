# MCP Server 快速開始 ⚡

5 分鐘內啟動您的 MCP Server！

## 🚀 一鍵設定

**執行環境：在 VSCode PowerShell 終端執行（位於 `C:\dev\AITUBER\mcp-server`）**

```powershell
# 進入專案目錄
cd C:\dev\AITUBER\mcp-server

# 執行設定腳本（會自動安裝依賴、建立目錄、編譯程式碼）
.\scripts\setup.ps1

# 啟動開發伺服器
.\scripts\start-dev.ps1
```

或者手動執行：

```powershell
# 安裝依賴
npm install

# 建立 .env 檔案
Copy-Item .env.example .env

# 啟動開發伺服器
npm run dev
```

## ✅ 驗證安裝

**執行環境：在 VSCode PowerShell 終端執行（新開一個終端）**

```powershell
# 測試 API
.\scripts\test-api.ps1
```

或手動測試：

```powershell
# 健康檢查
Invoke-RestMethod -Uri http://localhost:3001/health

# 應該返回：
# status  : ok
# message : MCP Server is running
```

## 📚 完整文件

- **[README.md](./README.md)** - 專案概述和功能介紹
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - 詳細設定指南
- **[INTEGRATION.md](./INTEGRATION.md)** - 與 aituber-kit 整合教學
- **[API 文件](./README.md#-api-文件)** - REST API 使用說明

## 🎯 下一步

### 整合到 aituber-kit

1. 複製以下程式碼到 aituber-kit 專案

2. 建立 `aituber-kit/src/lib/mcpClient.ts`
   - 參考 [INTEGRATION.md](./INTEGRATION.md) 步驟 1

3. 建立 `aituber-kit/src/components/interview/ResumeUpload.tsx`
   - 參考 [INTEGRATION.md](./INTEGRATION.md) 步驟 2

4. 修改 `aituber-kit/src/pages/interview.tsx`
   - 參考 [INTEGRATION.md](./INTEGRATION.md) 步驟 3

### 測試面試功能

1. 啟動兩個伺服器：
   ```powershell
   # Terminal 1: MCP Server
   cd C:\dev\AITUBER\mcp-server
   npm run dev

   # Terminal 2: aituber-kit
   cd C:\dev\AITUBER\aituber-kit
   npm run dev
   ```

2. 開啟瀏覽器訪問 `http://localhost:3000/interview`

3. 上傳履歷 PDF

4. 開始個性化面試！

## 🐛 遇到問題？

### 端口被佔用

```powershell
# 修改 .env 檔案中的 PORT
# PORT=3002
```

### CORS 錯誤

確認 `.env` 中包含：
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 找不到模組

```powershell
# 刪除並重新安裝
Remove-Item -Recurse -Force node_modules
npm install
```

### 編譯錯誤

```powershell
# 清理並重新編譯
Remove-Item -Recurse -Force dist
npm run build
```

## 💡 常用指令

```powershell
# 開發模式（熱重載）
npm run dev

# 編譯 TypeScript
npm run build

# 正式環境啟動
npm start

# Docker 部署
docker-compose up -d

# 停止 Docker
docker-compose down

# 查看日誌
docker logs mcp-server
```

## 📦 專案結構

```
mcp-server/
├── src/                    # 源代碼
│   ├── index.ts           # 主程式
│   ├── tools/             # MCP 工具
│   └── routes/            # API 路由
├── scripts/               # 輔助腳本
│   ├── setup.ps1         # 設定腳本
│   ├── start-dev.ps1     # 啟動腳本
│   └── test-api.ps1      # 測試腳本
├── uploads/              # 上傳檔案目錄
├── data/                 # 資料儲存目錄
├── .env                  # 環境變數
└── README.md            # 說明文件
```

## 🎉 完成！

您的 MCP Server 已準備就緒！現在可以開始使用了。

有問題請參考完整文件或提交 Issue。


