# MCP 伺服器重啟指南

## 快速重啟步驟（開發模式）

### 📌 執行環境：在 VSCode PowerShell 終端執行

```powershell
# 1. 切換到 MCP 伺服器目錄
cd C:\dev\AITUBER\mcp-server

# 2. 停止並移除舊容器
docker-compose -f docker-compose.dev.yml down

# 3. 重新建構並啟動（使用新的 pdfjs-dist）
docker-compose -f docker-compose.dev.yml up -d --build

# 4. 查看日誌確認啟動狀態
docker-compose -f docker-compose.dev.yml logs -f
```

### 成功啟動的訊息

當您看到以下訊息時，表示成功啟動：

```
MCP Server is running on port 3001
HTTP API is running on http://localhost:3001
```

按 `Ctrl+C` 退出日誌查看。

**注意**：開發模式會監聽檔案變更並自動重啟，所以如果修改程式碼後會自動生效。

---

## 測試 PDF 讀取功能

### 📌 執行環境：在 VSCode PowerShell 終端執行

```powershell
# 方法 1：單行版本（推薦，直接複製）
$body = @{ tool = "read_pdf"; arguments = @{ filePath = "詹偉廷-1759913377735-238606437.pdf" } } | ConvertTo-Json; Invoke-RestMethod -Uri "http://localhost:3001/api/mcp/tool" -Method Post -ContentType "application/json" -Body $body

# 方法 2：多行版本（注意不要在行之間加空行）
$body = @{
    tool = "read_pdf"
    arguments = @{
        filePath = "詹偉廷-1759913377735-238606437.pdf"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/mcp/tool" -Method Post -ContentType "application/json" -Body $body
```

### 預期結果

- ✅ 回傳 JSON 格式的 PDF 內容
- ✅ 文字提取比之前更完整
- ✅ 沒有明顯的文字遺漏問題

---

## 其他常用指令

### 📌 執行環境：在 VSCode PowerShell 終端執行

```powershell
# 只查看日誌（不重啟）
docker-compose -f docker-compose.dev.yml logs -f

# 重新啟動容器（不重新建構）
docker-compose -f docker-compose.dev.yml restart

# 停止容器
docker-compose -f docker-compose.dev.yml down

# 查看容器狀態
docker-compose -f docker-compose.dev.yml ps

# 進入容器內部（除錯用）
docker exec -it mcp-server-dev sh
```

---

## 問題排除

### 容器啟動失敗

**執行環境：在 VSCode PowerShell 終端執行**

```powershell
# 查看詳細錯誤訊息
docker logs mcp-server-dev

# 清理並重新建構
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d --build
```

### 端口被佔用

```powershell
# 檢查 3001 端口
netstat -ano | findstr :3001

# 如果被佔用，可以修改 docker-compose.yml 中的端口映射
# ports:
#   - "3002:3001"  # 改用 3002
```

### Canvas 編譯失敗

這通常是記憶體不足導致。解決方案：

1. 關閉其他 Docker 容器釋放記憶體
2. 重新建構時不要同時運行其他大型應用

---

## 生產模式（選用）

如果需要切換到生產模式：

### 📌 執行環境：在 VSCode PowerShell 終端執行

```powershell
# 先停止開發模式容器
docker-compose -f docker-compose.dev.yml down

# 啟動生產模式
cd C:\dev\AITUBER\mcp-server
docker-compose up -d --build
docker-compose logs -f
```

**注意**：生產模式不會監聽檔案變更，需要手動重啟才能載入新程式碼。

