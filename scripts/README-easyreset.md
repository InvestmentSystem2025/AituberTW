# EasyReset 腳本使用說明

## 簡介
`easyreset.ps1` 是一個 PowerShell 腳本，用於快速重設 Supabase 相關的 Docker 容器和資料卷。

## 功能
1. 停止所有 Supabase 相關容器
2. 刪除 Supabase 資料卷 (清除所有資料)
3. 重新啟動所有 Supabase 相關容器

## 使用方法

### 基本使用
```powershell
# 在專案根目錄執行 (直接執行，無確認提示)
.\scripts\easyreset.ps1
```

### 顯示說明
```powershell
.\scripts\easyreset.ps1 -Help
```

## 受影響的容器
- supabase-db (PostgreSQL 資料庫)
- supabase-auth (GoTrue 認證服務)
- supabase-rest (PostgREST API)
- supabase-realtime (即時更新服務)
- supabase-storage (檔案儲存服務)
- supabase-meta (PostgreSQL 元資料服務)
- supabase-studio (管理介面)
- supabase-kong (API 閘道)
- supabase-bootstrap (初始化服務)

## 受影響的資料卷
- `aituber-kit_supabase_db_data` (資料庫資料)
- `aituber-kit_supabase_storage_data` (儲存檔案)

## ⚠️ 注意事項
- **此操作會完全清除所有 Supabase 資料庫資料和儲存檔案**
- 建議在執行前備份重要資料
- **腳本會直接執行，不會顯示確認提示**

## 執行環境需求
- Windows PowerShell 5.1 或 PowerShell Core
- Docker 和 Docker Compose 已安裝並運行
- 在專案根目錄執行腳本
