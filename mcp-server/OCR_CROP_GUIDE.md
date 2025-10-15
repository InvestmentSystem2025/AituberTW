# OCR 裁切設定指南

## 問題

某些 PDF 履歷上方有 banner 圖片，OCR 會錯誤識別這些圖片導致亂碼。

## 解決方案

在 OCR 處理前自動裁切掉固定區域（如頂部的 banner）。

---

## 設定裁切參數

### 在 pdfTools.ts 中設定（預設）

目前預設裁切頂部 150 像素：

```typescript
body: JSON.stringify({
  filePath: path.basename(filePath),
  lang: 'chi_tra+eng+jpn',
  dpi: '300',
  crop_top: '150'  // 裁切頂部 150 像素
})
```

### 支援的裁切參數

- `crop_top`: 從頂部裁切的像素數
- `crop_bottom`: 從底部裁切的像素數
- `crop_left`: 從左側裁切的像素數
- `crop_right`: 從右側裁切的像素數

---

## 如何調整裁切大小

### 方法 1: 估算法

1. 查看 PDF 的 DPI（預設 300）
2. 測量 banner 的高度（例如 0.5 英寸）
3. 計算像素：`0.5 inch × 300 DPI = 150 pixels`

### 方法 2: 測試法

逐步調整直到效果最好：

```typescript
// 測試不同的裁切值
crop_top: '100'  // 太少 - 還是有亂碼
crop_top: '150'  // 剛好 - 完美
crop_top: '200'  // 太多 - 可能裁到正文
```

### 方法 3: 直接測試 API

**📌 在 VSCode PowerShell 終端執行**

```powershell
# 測試不同的裁切值
$body = @{
    filePath = "詹偉廷-1759913377735-238606437.pdf"
    lang = "chi_tra+eng+jpn"
    dpi = "300"
    crop_top = "150"  # 調整這個值
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/ocr/pdf-file" `
    -Method Post `
    -ContentType "application/json" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

---

## 重新啟動服務

修改 `pdfTools.ts` 後需要重啟：

### 📌 在 VSCode PowerShell 終端執行

```powershell
cd C:\dev\AITUBER\mcp-server
docker-compose -f docker-compose.dev.yml restart mcp-server-dev
```

OCR 服務的修改會自動生效（開發模式）。

---

## 測試結果

重啟後測試：

```powershell
$jsonBody = @{ tool = "read_pdf"; arguments = @{ filePath = "詹偉廷-1759913377735-238606437.pdf" } } | ConvertTo-Json
$utf8Body = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
$response = Invoke-RestMethod -Uri "http://localhost:3001/api/mcp/tool" -Method Post -ContentType "application/json; charset=utf-8" -Body $utf8Body

# 查看結果 - 應該不再有 banner 的亂碼
$response.result.text
```

---

## 常見問題

### Q: 如何知道裁切了多少？

查看 OCR 服務的日誌：

```powershell
docker logs ocr-service --tail 50
```

會顯示：
```
第 1 頁裁切: 2480x3508 -> 2480x3358
```

### Q: 不同的 PDF 需要不同的裁切值怎麼辦？

可以修改 `pdfTools.ts`，根據檔案名稱或其他條件設定不同的裁切值：

```typescript
let cropTop = '150';  // 預設值

// 根據特定 PDF 調整
if (filePath.includes('某種格式')) {
  cropTop = '200';
}

body: JSON.stringify({
  crop_top: cropTop
})
```

### Q: 裁切太多會怎樣？

- 可能會裁到正文內容
- 建議寧可少裁一點，保留更多內容

---

## 最佳實踐

1. **先測試** - 用單一 PDF 測試不同裁切值
2. **保守裁切** - 只裁切確定是 banner 的部分
3. **記錄設定** - 在註解中記錄為什麼選擇這個裁切值
4. **定期檢查** - 如果 PDF 格式改變，需要更新裁切值

