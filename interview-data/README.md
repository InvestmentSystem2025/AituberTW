# 面試記錄資料夾

此資料夾用於存放所有面試對話記錄的 JSON 檔案。

## 📁 檔案命名格式

```
interview_YYYY-MM-DDTHH-MM-SS-SSSZ.json
```

例如：
- `interview_2025-10-01T14-30-00-000Z.json`
- `interview_2025-10-01T16-45-23-456Z.json`

## 📊 JSON 資料結構

每個面試記錄檔案包含以下欄位：

```json
{
  "candidateId": "candidate-1696171800000",
  "interviewDate": "2025-10-01T14:30:00.000Z",
  "totalQuestions": 5,
  "answeredQuestions": 5,
  "answers": [
    {
      "question": {
        "id": "q1",
        "text": "請介紹一下您自己",
        "category": "基本資訊",
        "difficulty": "easy"
      },
      "answer": "我是一名...",
      "timestamp": "2025-10-01T14:32:00.000Z"
    }
  ],
  "interviewResult": {
    "candidateId": "candidate-1696171800000",
    "interviewDate": "2025-10-01T14:30:00.000Z",
    "totalQuestions": 5,
    "answeredQuestions": 5,
    "answerScores": [...],
    "finalScores": {
      "contentCompleteness": 8.5,
      "logicalClarity": 7.0,
      "professionalDepth": 8.0,
      "communicationSkills": 9.0,
      "personalTraits": 8.5
    },
    "totalScore": 8.2,
    "isPassed": true,
    "summary": {
      "strengths": ["溝通表達優秀", "專業知識紮實"],
      "weaknesses": ["邏輯條理可再加強"],
      "recommendations": ["建議多練習結構化思維"]
    }
  },
  "settings": {
    "questionCount": 5,
    "timePerQuestion": 180,
    "difficulty": "mixed",
    "categories": ["基本資訊", "動機"],
    "enableTimer": true,
    "enablePersonDetection": true
  }
}
```

## 🔑 欄位說明

### 基本資訊
- `candidateId`: 候選人唯一識別碼
- `interviewDate`: 面試日期時間（ISO 8601 格式）
- `totalQuestions`: 總問題數
- `answeredQuestions`: 已回答問題數

### 答案記錄 (answers)
每個答案包含：
- `question`: 問題資訊（id, text, category, difficulty）
- `answer`: 候選人的回答
- `timestamp`: 回答時間戳

### 評分結果 (interviewResult)
如果啟用了評分系統，會包含：
- `answerScores`: 每個答案的詳細評分
- `finalScores`: 五個維度的最終分數
  - `contentCompleteness`: 內容完整性 (0-10)
  - `logicalClarity`: 邏輯清晰度 (0-10)
  - `professionalDepth`: 專業深度 (0-10)
  - `communicationSkills`: 溝通表達 (0-10)
  - `personalTraits`: 個人特質 (0-10)
- `totalScore`: 總平均分數
- `isPassed`: 是否通過面試
- `summary`: 總結（優勢、弱點、建議）

### 面試設定 (settings)
記錄面試時的配置：
- `questionCount`: 問題數量
- `timePerQuestion`: 每題時間限制（秒）
- `difficulty`: 難度設定
- `categories`: 問題類別
- `enableTimer`: 是否啟用計時器
- `enablePersonDetection`: 是否啟用人員檢測

## 💡 使用方式

### 在面試結果頁面保存記錄

完成面試後，在結果頁面點擊「💾 保存面試記錄」按鈕即可自動保存到此資料夾。

### 手動查看記錄

直接打開 JSON 檔案即可查看完整的面試記錄。

### API 端點

**POST** `/api/save-interview-record`

請求體：
```json
{
  "candidateId": "string",
  "interviewDate": "ISO 8601 string",
  "totalQuestions": "number",
  "answeredQuestions": "number",
  "answers": [...],
  "interviewResult": {...},
  "settings": {...}
}
```

## 🗄️ 資料備份

建議定期備份此資料夾的內容，以防數據遺失。

## 🔒 隱私提醒

面試記錄可能包含個人資訊，請妥善保管，避免未授權訪問。

