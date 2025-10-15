# OCR 服務 Dockerfile
FROM python:3.11-slim

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-chi-tra \
    tesseract-ocr-chi-sim \
    tesseract-ocr-jpn \
    tesseract-ocr-eng \
    poppler-utils \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 設定工作目錄
WORKDIR /app

# 複製 requirements
COPY requirements.txt .

# 安裝 Python 依賴
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式
COPY . .

# 創建臨時目錄
RUN mkdir -p /app/temp

# 暴露端口
EXPOSE 5000

# 啟動應用
CMD ["python", "app.py"]

