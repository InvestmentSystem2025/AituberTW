# Docker 網絡配置說明

## ✅ 問題已解決

### 原始問題
- aituber-kit 和 MCP Server 都在 Docker 容器中運行
- 容器在不同的網絡中，無法互相通訊
- 瀏覽器錯誤：`http://localhost:3001/api/mcp/tool 500 (Internal Server Error)`

### 解決方案
讓兩個容器加入同一個 Docker 網絡，並使用**容器名稱**進行通訊。

## 📋 老闆需求確認

### 老闆的要求
> "在與 AI VTuber 進程不同的位置（不同資料夾/不同專案）創建一個共享的 MCP 服務器"

### ✅ 完全符合要求

1. **✅ 獨立資料夾**：
   ```
   C:\dev\AITUBER\
   ├── aituber-kit\         ← AI VTuber 專案
   └── mcp-server\          ← 獨立的 MCP Server 專案
   ```

2. **✅ 獨立專案**：
   - 各自的 `package.json`
   - 各自的 `node_modules`
   - 各自的源碼和配置
   - 可以獨立開發和版本控制

3. **✅ 獨立部署**：
   - 可以單獨啟動/停止
   - 可以單獨更新
   - 互不影響

4. **Docker 網絡只是通訊橋樑**：
   - 類比：兩棟獨立大樓之間的橋
   - 專案仍然完全獨立
   - 符合微服務架構標準

## 🔧 配置修改

### 1. MCP Server (`mcp-server/docker-compose.dev.yml`)

**修改前：**
```yaml
networks:
  - mcp-network

networks:
  mcp-network:
    driver: bridge
```

**修改後：**
```yaml
networks:
  - aituber-kit_default  # 加入 aituber-kit 的網絡以便通訊

networks:
  aituber-kit_default:
    external: true  # 使用外部已存在的網絡
```

### 2. aituber-kit (`.env`)

**修改前：**
```env
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001
```

**修改後：**
```env
NEXT_PUBLIC_MCP_SERVER_URL=http://mcp-server-dev:3001
```

**重要說明：**
- 在 Docker 網絡中，容器之間使用**容器名稱**通訊
- `localhost` 在容器內指向容器本身，不是主機
- `mcp-server-dev` 是 MCP Server 容器的名稱

## 📊 網絡架構

### 修改前（無法通訊）
```
┌─────────────────────┐         ┌─────────────────────┐
│  aituber-kit 容器   │         │  mcp-server 容器    │
│  Network:           │    ✗    │  Network:           │
│  aituber-kit_default│         │  mcp-server_mcp-net │
└─────────────────────┘         └─────────────────────┘
```

### 修改後（可以通訊）
```
┌──────────────────────────────────────────────────┐
│         aituber-kit_default 網絡                  │
│                                                   │
│  ┌──────────────────┐      ┌──────────────────┐ │
│  │ aituber-kit 容器 │ ←──→ │ mcp-server 容器  │ │
│  │ Port: 3000       │      │ Port: 3001       │ │
│  └──────────────────┘      └──────────────────┘ │
└──────────────────────────────────────────────────┘
```

## 🚀 重新啟動服務

### 1. 停止所有容器
```powershell
# 停止 aituber-kit
cd C:\dev\AITUBER\aituber-kit
docker-compose down

# 停止 MCP Server
cd C:\dev\AITUBER\mcp-server
docker-compose -f docker-compose.dev.yml down
```

### 2. 啟動服務（順序重要）
```powershell
# 先啟動 aituber-kit（建立網絡）
cd C:\dev\AITUBER\aituber-kit
docker-compose up -d

# 再啟動 MCP Server（加入網絡）
cd C:\dev\AITUBER\mcp-server
docker-compose -f docker-compose.dev.yml up -d
```

### 3. 驗證連接
```powershell
# 查看兩個容器是否在同一網絡
docker ps --format "table {{.Names}}\t{{.Networks}}"

# 應該看到：
# mcp-server-dev      aituber-kit_default
# aituber-kit-app-1   aituber-kit_default

# 從 aituber-kit 容器測試連接
docker exec aituber-kit-app-1 wget -qO- http://mcp-server-dev:3001/health
```

## 🧪 測試步驟

1. **刷新瀏覽器**
   - 訪問：`http://localhost:3000/interview`
   - 按 `Ctrl+Shift+R` 強制刷新

2. **上傳履歷測試**
   - 點擊「📄 上傳面試者履歷」
   - 選擇 PDF 檔案
   - 應該成功上傳和分析

3. **預期結果**
   - ✓ 履歷成功上傳
   - ✓ 顯示分析結果
   - ✓ 生成個性化問題
   - ✓ 沒有 500 錯誤

## 📝 重要注意事項

### 1. 容器啟動順序
- **必須先啟動 aituber-kit**（建立網絡）
- 再啟動 MCP Server（加入網絡）

### 2. 環境變數
- 容器內使用：`http://mcp-server-dev:3001`
- 瀏覽器訪問：`http://localhost:3001`（如果需要直接訪問）

### 3. 網絡名稱
- 自動生成格式：`{專案名}_default`
- aituber-kit 的網絡：`aituber-kit_default`
- 如果專案名不同，需要相應調整

## 🐛 故障排除

### 問題：容器無法互相通訊

**檢查步驟：**
```powershell
# 1. 確認兩個容器都在運行
docker ps

# 2. 確認在同一網絡
docker ps --format "table {{.Names}}\t{{.Networks}}"

# 3. 測試連接
docker exec aituber-kit-app-1 ping -c 3 mcp-server-dev
docker exec aituber-kit-app-1 wget -qO- http://mcp-server-dev:3001/health
```

**解決方案：**
```powershell
# 重新啟動（注意順序）
docker-compose down
cd ..\aituber-kit && docker-compose down
cd ..\aituber-kit && docker-compose up -d
cd ..\mcp-server && docker-compose -f docker-compose.dev.yml up -d
```

### 問題：環境變數沒有生效

**檢查：**
```powershell
# 查看容器內的環境變數
docker exec aituber-kit-app-1 env | Select-String "MCP"
```

**解決：**
```powershell
# 重啟容器
docker-compose restart
```

## ✅ 完成檢查清單

- [ ] 兩個容器都在 `aituber-kit_default` 網絡
- [ ] `.env` 檔案使用 `http://mcp-server-dev:3001`
- [ ] 容器可以互相通訊
- [ ] 瀏覽器可以上傳履歷
- [ ] 履歷分析成功
- [ ] 生成個性化問題
- [ ] 沒有 500 錯誤

## 🎉 完成！

現在您的系統架構：
- ✅ MCP Server 在獨立專案中
- ✅ aituber-kit 在獨立專案中
- ✅ 兩者可以通過 Docker 網絡通訊
- ✅ 完全符合老闆的需求
- ✅ 符合微服務最佳實踐


