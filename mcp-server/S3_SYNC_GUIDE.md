# S3 同步功能指南

## 概述

MCP Server 支援自動將上傳的履歷文件同步到 AWS S3，實現文件備份和長期存儲。

## 功能特性

- ✅ **定時同步**：根據 Cron 表達式自動同步文件
- ✅ **手動觸發**：通過 API 手動觸發同步
- ✅ **智能去重**：自動跳過已存在的文件，避免重複上傳
- ✅ **狀態記錄**：記錄同步狀態，避免重複上傳
- ✅ **可選刪除**：上傳成功後可選擇刪除本地文件

## 配置步驟

### 1. 安裝依賴

依賴已包含在 `package.json` 中，執行：

```bash
npm install
```

### 2. 配置環境變數

在 `.env` 文件中添加以下配置：

```env
# 必需配置
S3_BUCKET=your-resume-bucket
S3_REGION=ap-northeast-1

# 可選配置
S3_PREFIX=resumes/                    # S3 路徑前綴，預設為 resumes/
S3_SYNC_SCHEDULE=0 * * * *            # Cron 表達式，預設每小時
S3_DELETE_AFTER_UPLOAD=false          # 上傳後是否刪除本地文件

# AWS 憑證（如果使用 IAM 角色可省略）
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### 3. AWS 憑證配置

有三種方式配置 AWS 憑證：

#### 方式 1：環境變數（推薦用於開發）
```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

#### 方式 2：IAM 角色（推薦用於生產環境）
如果 MCP Server 運行在 EC2 或 ECS 上，可以使用 IAM 角色，無需配置憑證。

#### 方式 3：AWS 配置文件
使用 `~/.aws/credentials` 文件（本地開發）

### 4. S3 Bucket 權限

確保 AWS 憑證或 IAM 角色具有以下權限：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::your-resume-bucket/resumes/*"
    }
  ]
}
```

## Cron 表達式範例

| 表達式 | 說明 |
|--------|------|
| `0 * * * *` | 每小時的第 0 分鐘 |
| `0 */6 * * *` | 每 6 小時 |
| `0 0 * * *` | 每天午夜 |
| `*/30 * * * *` | 每 30 分鐘 |
| `0 2 * * *` | 每天凌晨 2 點 |

Cron 格式：`分鐘 小時 日 月 星期`

## API 使用

### 手動觸發同步

```bash
curl -X POST http://localhost:3001/api/s3/sync
```

響應：
```json
{
  "success": true,
  "message": "同步完成"
}
```

## 同步狀態

同步狀態保存在 `.s3-sync-state.json` 文件中：

```json
{
  "lastSyncTime": "2024-01-15T10:30:00.000Z",
  "uploadedFiles": [
    "resumes/resume-1234567890-123456789.pdf",
    "resumes/resume-1234567891-123456790.pdf"
  ]
}
```

## 日誌輸出

同步過程會輸出詳細日誌：

```
🔄 开始同步文件到 S3...
📄 找到 5 个 PDF 文件
✅ 已上传 resume-1234567890-123456789.pdf 到 S3 (245.32 KB)
⏭️  文件 resume-1234567891-123456790.pdf 已存在于 S3，跳过
✅ 同步完成: 成功 4, 跳过 1, 失败 0
```

## 故障排除

### 問題：S3 同步未啟動

**檢查：**
1. 確認 `S3_BUCKET` 環境變數已設置
2. 檢查 AWS 憑證是否正確
3. 查看服務日誌：`docker logs mcp-server`

### 問題：上傳失敗

**檢查：**
1. AWS 憑證權限是否足夠
2. S3 Bucket 是否存在
3. 網絡連接是否正常
4. 查看錯誤日誌

### 問題：重複上傳

**解決：**
- 同步狀態文件 `.s3-sync-state.json` 可能損壞，刪除後重新同步
- 檢查 S3 中是否真的存在文件

## 最佳實踐

1. **生產環境**：使用 IAM 角色而非硬編碼憑證
2. **定時同步**：根據文件上傳頻率調整同步間隔
3. **本地保留**：建議設置 `S3_DELETE_AFTER_UPLOAD=false`，保留本地備份
4. **監控**：定期檢查同步日誌，確保正常運行
5. **備份**：定期備份 `.s3-sync-state.json` 文件

## 注意事項

- 同步狀態文件 `.s3-sync-state.json` 保存在項目根目錄
- 如果刪除狀態文件，下次同步會重新檢查所有文件
- 上傳失敗的文件不會從狀態記錄中移除，下次會重試
- 如果設置了 `S3_DELETE_AFTER_UPLOAD=true`，請確保 S3 上傳成功後再刪除本地文件

