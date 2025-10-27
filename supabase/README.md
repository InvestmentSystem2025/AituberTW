# Supabase 自架服務使用指南

## 🚀 快速開始

### 1. 啟動 Supabase 服務

```bash
# 啟動所有服務 (包含 Supabase)
docker-compose -f docker-compose.ollama.yml up -d

# 只啟動 Supabase 相關服務
docker-compose -f docker-compose.ollama.yml up -d supabase-db supabase-auth supabase-rest supabase-realtime supabase-storage supabase-studio supabase-kong
```

### 2. 服務存取位址

| 服務 | 位址 | 說明 |
|------|------|------|
| **Kong Gateway** | http://localhost:8001 | 統一 API 入口 |
| **Supabase Studio** | http://localhost:54323 | 資料庫管理介面 |
| **PostgreSQL** | localhost:5432 | 直接資料庫連線 |

### 3. API 端點

- **認證**: `http://localhost:8001/auth`
- **REST API**: `http://localhost:8001/rest`
- **檔案儲存**: `http://localhost:8001/storage`
- **即時通訊**: `http://localhost:8001/realtime`

## 🔑 API Keys

### 環境變數設定

```env
# 在 supabase/supabase.env 中
POSTGRES_PASSWORD=dev-strong-password-2025
JWT_SECRET=dev-very-strong-jwt-secret-key-for-aituber-kit-2025
SITE_URL=http://localhost:8001

SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

### 權限層級

| 類型 | 用途 | 權限範圍 |
|------|------|----------|
| **anon key** | 前端 (未登入/登入後) | 受 RLS 保護 |
| **user JWT** | 登入後使用者 | 決定可存取資料範圍 |
| **service role key** | 後端管理 | 繞過 RLS (最高應用層權限) |
| **Postgres superuser** | DBA 維運 | 直接操作 DB |

## 📊 資料庫結構

### 主要資料表

1. **profiles** - 使用者資料
2. **ai_sessions** - AI 會話記錄
3. **ai_conversations** - AI 對話內容
4. **news_articles** - 新聞資料

### RLS 政策

- 使用者只能存取自己的資料
- 新聞資料公開讀取
- 管理員可存取所有資料

## 🛠️ Node.js 連線範例

### 安裝依賴

```bash
cd supabase/examples
npm install
```

### 執行範例

```bash
# 使用者註冊
npm run signup

# 使用者登入
npm run login

# 後端管理
npm run admin
```

## 🌐 網頁測試介面

### 快速測試

1. **啟動 Supabase 服務**
   ```bash
   docker-compose -f docker-compose.ollama.yml up -d
   ```

2. **開啟測試頁面**
   - 直接開啟 `supabase/test.html` 檔案
   - 或使用 HTTP 伺服器：
     ```bash
     # 使用 Python
     python -m http.server 8080
     # 然後開啟 http://localhost:8080/supabase/test.html
     
     # 或使用 Node.js
     npx serve .
     ```

### 測試功能

| 功能 | 說明 | 測試項目 |
|------|------|----------|
| **連線狀態** | 檢查 Supabase 服務連線 | 自動檢查連線狀態 |
| **認證測試** | 使用者註冊、登入、登出 | 完整的認證流程 |
| **資料庫測試** | CRUD 操作測試 | 建立、查詢、更新資料 |
| **即時功能** | WebSocket 即時通訊 | 即時資料變更通知 |
| **操作日誌** | 詳細的操作記錄 | 所有操作的即時回饋 |

### 網頁測試特色

- **🎨 美觀介面**: 現代化的 UI 設計
- **📱 響應式**: 支援手機、平板、桌面
- **⚡ 即時回饋**: 所有操作都有即時狀態顯示
- **🔍 詳細日誌**: 完整的操作記錄和錯誤訊息
- **🧪 完整測試**: 涵蓋所有 Supabase 核心功能

### 測試流程建議

1. **檢查連線**: 確認 Supabase 服務正常運行
2. **註冊使用者**: 建立測試帳號
3. **登入測試**: 驗證認證功能
4. **資料操作**: 測試資料庫 CRUD 操作
5. **即時功能**: 測試 WebSocket 即時通訊
6. **權限測試**: 驗證 RLS 政策是否正常運作

## 🔧 故障排除

### 常見問題

1. **Port 衝突**: 確保 5432, 8001, 54323 未被其他服務使用
2. **資料庫連線失敗**: 檢查 supabase-db 容器是否正常啟動
3. **JWT 驗證失敗**: 確認 JWT_SECRET 在所有服務中一致

### 檢查服務狀態

```bash
# 檢查所有容器狀態
docker ps

# 檢查 Supabase 服務日誌
docker logs supabase-db
docker logs supabase-auth
docker logs supabase-rest
docker logs supabase-kong
```

### 重新初始化資料庫

```bash
# 停止服務
docker-compose -f docker-compose.ollama.yml down

# 刪除資料庫 volume
docker volume rm aituber-kit_supabase_db_data

# 重新啟動
docker-compose -f docker-compose.ollama.yml up -d
```

## 🔐 安全注意事項

1. **生產環境**: 請更換所有預設密碼和 JWT secret
2. **API Keys**: service role key 僅限後端使用，不可暴露於前端
3. **CORS**: 已在 Kong 中設定，可根據需要調整
4. **資料備份**: 定期備份 supabase_db_data volume

## 📚 進階功能

### 自訂 RLS 政策

在 Supabase Studio 中可視化編輯 Row Level Security 政策。

### 即時訂閱

```javascript
// 訂閱資料變更
const subscription = supabase
  .channel('public:ai_conversations')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'ai_conversations' },
    (payload) => console.log('新對話:', payload.new)
  )
  .subscribe()
```

### 檔案上傳

```javascript
// 上傳檔案到 Storage
const { data, error } = await supabase.storage
  .from('avatars')
  .upload('user-avatar.jpg', file)
```
