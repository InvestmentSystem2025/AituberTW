# 構建階段
FROM node:20-alpine AS builder

# 安裝 canvas 和 pdfjs-dist 需要的系統依賴
RUN apk add --no-cache \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    python3

# 設定工作目錄
WORKDIR /app

# 複製 package.json
COPY package*.json ./

# 安裝所有依賴（包括 devDependencies，用於構建）
RUN npm install

# 複製源代碼
COPY . .

# 建立 TypeScript
RUN npm run build

# 生產階段
FROM node:20-alpine

# 安裝 canvas 運行時依賴
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman

# 設定工作目錄
WORKDIR /app

# 複製 package.json
COPY package*.json ./

# 只安裝生產依賴
RUN npm install --production

# 從構建階段複製編譯好的代碼
COPY --from=builder /app/dist ./dist

# 創建上傳和數據目錄
RUN mkdir -p /app/uploads /app/data

# 設定環境變數
ENV NODE_ENV=production
ENV PORT=3001

# 暴露端口
EXPOSE 3001

# 啟動應用
CMD ["node", "dist/index.js"]

