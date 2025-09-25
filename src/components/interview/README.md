# 面試功能模組

這個模組提供了完整的 AI 面試功能，包括人員檢測、問題管理、計時器和結果分析。

## 功能特色

### 1. 人員檢測 (PersonDetection)
- 使用 MediaPipe 進行即時人臉檢測
- 自動檢測面試者是否就位
- 檢測信心度顯示
- 支援手動控制檢測開關

### 2. 面試流程管理 (useInterviewFlow)
- 自動倒數計時（3秒）
- 面試狀態管理（等待/檢測/就緒/面試中）
- 回答記錄和時間戳記
- 面試結果管理

### 3. 問題系統 (InterviewQuestions)
- 預設面試問題庫
- 可自定義問題難度和類別
- 計時器功能（可設定每題時間）
- 進度追蹤

### 4. 結果分析 (InterviewResults)
- 完整的回答記錄
- 完成率統計
- 問題分類和難度標示
- 重新開始或退出選項

### 5. 設置面板 (InterviewSettings)
- 問題數量設定（3-10題）
- 每題時間設定（1-5分鐘）
- 難度選擇（簡單/中等/困難/混合）
- 問題類別篩選
- 功能開關（計時器/人員檢測）

## 使用方式

### 基本使用
```tsx
import { Interview } from '@/pages/interview'

// 在路由中使用
<Route path="/interview" component={Interview} />
```

### 自定義設置
```tsx
import { InterviewSettings, InterviewSettingsData } from '@/components/interview/InterviewSettings'

const settings: InterviewSettingsData = {
  questionCount: 5,
  timePerQuestion: 180,
  difficulty: 'mixed',
  categories: ['基本資訊', '動機', '問題解決'],
  enableTimer: true,
  enablePersonDetection: true
}
```

## 組件結構

```
src/components/interview/
├── hooks/
│   ├── useInterviewFlow.ts      # 面試流程管理
│   └── usePersonDetection.ts    # 人員檢測邏輯
├── PersonDetection.tsx          # 人員檢測組件
├── InterviewControls.tsx        # 控制面板
├── InterviewQuestions.tsx       # 問題顯示組件
├── InterviewResults.tsx         # 結果分析組件
├── InterviewSettings.tsx        # 設置面板
└── README.md                   # 說明文件
```

## 狀態流程

1. **等待開始** → 人員檢測啟動
2. **檢測人員** → 等待面試者就位
3. **準備就緒** → 開始3秒倒數
4. **面試進行** → 顯示問題，記錄回答
5. **顯示結果** → 分析回答，提供統計

## 技術要求

- React 18+
- TypeScript
- Tailwind CSS
- MediaPipe Tasks Vision (用於人員檢測)

## 注意事項

1. 人員檢測需要瀏覽器支援 MediaDevices API
2. 建議在 HTTPS 環境下使用以確保鏡頭權限正常
3. 面試設置會保存在本地，重新載入頁面後會重置
4. 回答記錄目前僅保存在記憶體中，頁面重新載入會遺失

## 未來擴展

- [ ] 與 AI 模型整合，提供即時回饋
- [ ] 回答語音轉文字功能
- [ ] 面試記錄持久化儲存
- [ ] 更多問題類別和難度
- [ ] 面試報告生成
- [ ] 多語言支援
