# OCR Service

PDF OCR 服務，使用 Tesseract 進行光學字符識別。

## 功能

- PDF 轉圖像
- 多語言 OCR（繁中、簡中、英文、日文）
- 分頁識別
- RESTful API

## API 端點

### 1. 健康檢查

```
GET /health
```

### 2. PDF OCR

```
POST /ocr/pdf
Content-Type: multipart/form-data

參數：
- file: PDF 文件（必需）
- lang: 語言（選填，預設 'chi_tra+eng+jpn'）
- dpi: 解析度（選填，預設 300）
```

### 3. 圖像 OCR

```
POST /ocr/image
Content-Type: multipart/form-data

參數：
- file: 圖像文件（必需）
- lang: 語言（選填，預設 'chi_tra+eng+jpn'）
```

## 支援語言

- `chi_tra`: 繁體中文
- `chi_sim`: 簡體中文
- `jpn`: 日文
- `eng`: 英文

可組合使用，例如：`chi_tra+eng+jpn`

