# RSS 新聞來源配置

## 台灣新聞來源

### 科技新聞
- **TechNews 科技新報**: `https://feeds.feedburner.com/technews`
- **數位時代**: `https://www.bnext.com.tw/rss/articles`
- **iThome**: `https://www.ithome.com.tw/rss`

### 一般新聞
- **中央社**: `https://www.cna.com.tw/rss/aipl.xml` (政治)
- **中央社科技**: `https://www.cna.com.tw/rss/ait.xml`
- **聯合新聞網**: `https://udn.com/rssfeed/news/1/6638?ch=news`

### 經濟財經
- **經濟日報**: `https://money.udn.com/rssfeed/news/1001/5591?ch=money`
- **工商時報**: `https://ctee.com.tw/feed`

## 日本新聞來源

### 一般新聞
- **NHK News**: `https://www3.nhk.or.jp/rss/news/cat0.xml`
- **Asahi Shimbun**: `http://rss.asahi.com/rss/asahi/newsheadlines.rdf`
- **Mainichi Shimbun**: `https://mainichi.jp/rss/etc/mainichi-flash.rss`

### 科技新聞
- **ITmedia**: `https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml`
- **Nikkei Tech**: `https://www.nikkei.com/rss/?n_cid=DSREA_rss`

### 經濟新聞
- **Nikkei**: `https://www.nikkei.com/rss/?n_cid=DSREA_rss`
- **Reuters Japan**: `https://feeds.reuters.com/reuters/JPBusinessNews`

## n8n 工作流程配置建議

### 基本設置
1. **執行頻率**: 每 30 分鐘 (可調整為 15 分鐘或 1 小時)
2. **同時處理**: 台灣和日本來源並行處理
3. **錯誤處理**: 單一來源失敗不影響其他來源

### 資料處理
1. **內容清理**: 移除 HTML 標籤
2. **長度過濾**: 忽略內容少於 50 字元的項目
3. **重複檢測**: 基於 URL 或標題去重
4. **語言標記**: 自動標記繁體中文

### 存儲配置
1. **向量資料庫**: 存入 `news_knowledge` 集合
2. **JSON 備份**: 保存到 `news-data/` 資料夾
3. **元資料**: 包含來源、日期、語言等資訊

## 測試建議

### 開發階段
- 使用較少的 RSS 來源 (1-2 個)
- 設置較短的執行間隔 (5-10 分鐘)
- 監控日誌和錯誤

### 生產階段
- 增加更多 RSS 來源
- 設置合理的執行間隔 (30-60 分鐘)
- 設置通知和監控

## 注意事項

1. **版權問題**: 確保遵守各新聞網站的使用條款
2. **頻率限制**: 避免過於頻繁的請求
3. **內容質量**: 定期檢查抓取的內容質量
4. **存儲管理**: 定期清理舊的新聞數據

