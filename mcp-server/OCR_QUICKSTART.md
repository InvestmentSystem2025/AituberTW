# OCR 服務快速啟動

## 啟動服務

### 📌 在 VSCode PowerShell 終端執行

```powershell
cd C:\dev\AITUBER\mcp-server

# 停止舊服務
docker-compose -f docker-compose.dev.yml down

# 建構並啟動（包含 OCR 服務）
docker-compose -f docker-compose.dev.yml up -d --build

# 查看日誌
docker-compose -f docker-compose.dev.yml logs -f
```

**注意**：首次建構 OCR 服務需要 5-10 分鐘（下載 Tesseract）

---

## 驗證服務

### 📌 在 VSCode PowerShell 終端執行

```powershell
# 1. 檢查容器狀態
docker-compose -f docker-compose.dev.yml ps

# 2. 測試 OCR 健康檢查
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

---

## 測試 PDF OCR

### 📌 在 VSCode PowerShell 終端執行

```powershell
# 測試檔案路徑
$pdfPath = "C:\dev\AITUBER\mcp-server\uploads\詹偉廷-1759913377735-238606437.pdf"

# 創建請求
$form = @{
    file = Get-Item -Path $pdfPath
    lang = 'chi_tra+eng+jpn'
    dpi = '300'
}

# 發送請求
$response = Invoke-RestMethod -Uri "http://localhost:5000/ocr/pdf" -Method Post -Form $form

# 查看完整文字
$response.ocr.full_text

# 查看統計
Write-Host "總頁數: $($response.ocr.total_pages)"
Write-Host "總字符數: $($response.ocr.total_chars)"
```

---

## 預期結果

1. **PDF 轉圖像**：應該回報成功轉換為 4 張圖像
2. **OCR 識別**：應該提取到完整的中文、英文、日文內容
3. **文字完整度**：應該比 pdfjs-dist 提取的更完整

---

## 問題排除

### OCR 服務未啟動

```powershell
docker logs ocr-service
```

### 記憶體不足

降低 DPI：

```powershell
$form = @{
    file = Get-Item -Path $pdfPath
    lang = 'chi_tra+eng+jpn'
    dpi = '150'  # 降低到 150
}
```

### 查看詳細日誌

```powershell
docker logs ocr-service -f
```

