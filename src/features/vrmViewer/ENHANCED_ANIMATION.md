# VRM 增強動畫系統

## 概述

本文檔說明 VRM 模型的兩個主要動畫增強功能：
1. **智能表情變化時機**
2. **自然嘴型動畫**

## 1. 智能表情變化時機 🎭

### 問題
原本的實現在整個說話過程中都保持同一個表情，缺乏動態感。

### 解決方案
實現分階段的表情變化流程：

```
開始說話 → 保持 relaxed → 1秒後 → 顯示情感表情 → 1.5秒後 → 回到 relaxed → 繼續說話
```

### 實現邏輯

```typescript
public async speak(buffer: ArrayBuffer, talk: Talk, isNeedDecode: boolean = true) {
  // 1. 開始時保持 relaxed 表情
  this.emoteController?.playEmotion('relaxed')
  
  // 2. 如果有特定情感標籤（不是 neutral 或 relaxed）
  if (talk.emotion && talk.emotion !== 'neutral' && talk.emotion !== 'relaxed') {
    // 3. 1秒後顯示情感表情
    setTimeout(() => {
      this.emoteController?.playEmotion(talk.emotion)
      
      // 4. 1.5秒後回到 relaxed
      setTimeout(() => {
        this.emoteController?.playEmotion('relaxed')
      }, 1500)
    }, 1000)
  }
  
  // 5. 播放音訊
  await this._lipSync?.playFromArrayBuffer(buffer, ...)
}
```

### 時間軸範例

假設 AI 說：「你好！今天天氣真好，很高興見到你。」（情感：happy）

```
0.0s  ─┬─ 開始說話：「你好！」（relaxed 表情）
       │
1.0s  ─┼─ 第一句結束，切換到 happy 表情
       │   繼續說話：「今天天氣真好」
       │
2.5s  ─┼─ 回到 relaxed 表情
       │   繼續說話：「很高興見到你」
       │
4.0s  ─┴─ 說話結束
```

### 優點

- ✅ 更自然的表情變化
- ✅ 避免整段話都是同一個誇張表情
- ✅ 在關鍵時刻強調情感
- ✅ 保持整體的親和感（relaxed 作為基礎表情）

## 2. 自然嘴型動畫 👄

### 問題
原本的實現一直使用 "aa" 表情，導致嘴巴一直張開，看起來不自然。

### 解決方案
交替使用 "aa"（張嘴）和 "oh"（圓嘴）表情，每 0.2 秒切換一次。

### 實現邏輯

```typescript
// 嘴型狀態
private _currentMouthShape: 'aa' | 'oh' = 'aa'
private _mouthAnimationTimer?: NodeJS.Timeout

// 開始交替動畫
private startMouthAnimation(): void {
  this._mouthAnimationTimer = setInterval(() => {
    this._currentMouthShape = this._currentMouthShape === 'aa' ? 'oh' : 'aa'
  }, 200) // 每 0.2 秒切換
}

// 在 update 中應用
public update(delta: number): void {
  if (this._lipSync) {
    const { volume } = this._lipSync.update()
    
    if (volume > 0.01) {
      // 正在說話 - 啟動交替動畫
      if (!this._mouthAnimationTimer) {
        this.startMouthAnimation()
      }
      // 使用當前嘴型
      this.emoteController?.lipSync(this._currentMouthShape, volume)
    } else {
      // 沒有說話 - 停止動畫並閉嘴
      if (this._mouthAnimationTimer) {
        this.stopMouthAnimation()
      }
      this.emoteController?.lipSync('aa', 0)
    }
  }
}
```

### 動畫序列

```
時間: 0.0s  0.2s  0.4s  0.6s  0.8s  1.0s
嘴型: aa -> oh -> aa -> oh -> aa -> oh -> ...
```

### 視覺效果

- **aa 表情**：嘴巴張開（啊）
- **oh 表情**：嘴巴圓形（喔）
- **交替頻率**：5 次/秒（每 0.2 秒切換）

### 優點

- ✅ 更自然的說話動作
- ✅ 模擬真實的口型變化
- ✅ 避免嘴巴一直張開的僵硬感
- ✅ 適配不同的發音

## 技術細節

### 計時器管理

為了避免記憶體洩漏和衝突，系統會妥善管理所有計時器：

```typescript
public stopSpeaking() {
  this._lipSync?.stopCurrentPlayback()
  
  // 清理嘴型動畫計時器
  if (this._mouthAnimationTimer) {
    clearInterval(this._mouthAnimationTimer)
    this._mouthAnimationTimer = undefined
  }
  
  // 清理表情過渡計時器
  if (this._emotionTransitionTimer) {
    clearTimeout(this._emotionTransitionTimer)
    this._emotionTransitionTimer = undefined
  }
  
  this._currentMouthShape = 'aa'
}
```

### 參數調整

如果需要調整動畫參數，可以修改以下數值：

#### 表情時機參數

```typescript
// 在 speak() 方法中
setTimeout(() => {
  // 顯示情感表情的延遲時間（目前：1秒）
  this.emoteController?.playEmotion(talk.emotion)
  
  setTimeout(() => {
    // 情感表情持續時間（目前：1.5秒）
    this.emoteController?.playEmotion('relaxed')
  }, 1500)  // ← 調整這裡
}, 1000)    // ← 調整這裡
```

#### 嘴型動畫參數

```typescript
// 在 startMouthAnimation() 方法中
this._mouthAnimationTimer = setInterval(() => {
  this._currentMouthShape = this._currentMouthShape === 'aa' ? 'oh' : 'aa'
}, 200)  // ← 調整這裡（單位：毫秒）

// 在 update() 方法中
if (volume > 0.01) {  // ← 調整音量閾值
  // ...
}
```

### 建議的調整範圍

| 參數 | 目前值 | 建議範圍 | 說明 |
|------|--------|----------|------|
| 情感表情延遲 | 1000ms | 500-1500ms | 第一句話的長度 |
| 情感表情持續 | 1500ms | 1000-2000ms | 情感強調的時間 |
| 嘴型切換間隔 | 200ms | 100-300ms | 越短越快，越長越慢 |
| 音量閾值 | 0.01 | 0.005-0.05 | 判定為「正在說話」的敏感度 |

## 測試建議

### 測試表情變化

1. 開始面試對話
2. 觀察 AI 開始說話時的表情（應為 relaxed）
3. 注意 1 秒後表情變化（變為情感表情）
4. 注意 1.5 秒後表情變化（回到 relaxed）
5. 檢查控制台日誌：
   - `🎭 開始說話，保持 relaxed 表情`
   - `🎭 顯示情感表情: happy`
   - `🎭 回到 relaxed 表情`

### 測試嘴型動畫

1. 觀察 AI 說話時的嘴型變化
2. 確認嘴巴在張開（aa）和圓形（oh）之間交替
3. 確認切換頻率約為每秒 5 次
4. 確認說話停止時嘴巴閉合

### 調試工具

在瀏覽器控制台執行：

```javascript
// 查看當前嘴型
viewer.model._currentMouthShape

// 手動測試嘴型
viewer.model.emoteController.lipSync('aa', 0.5)
viewer.model.emoteController.lipSync('oh', 0.5)
```

## 相關文件

- `src/features/vrmViewer/model.ts` - VRM 模型類別（主要實現）
- `src/features/vrmViewer/README.md` - VRM 檢視器總覽
- `src/features/vrmViewer/README_ja.md` - 日文版說明
- `src/features/vrmViewer/EMOTION_TIMING.md` - 表情時機說明

## 已知限制

1. **固定時間間隔**：表情變化的時間是固定的，無法根據句子長度自動調整
2. **嘴型選擇**：目前只使用 aa 和 oh 兩種嘴型，未來可以加入更多變化
3. **情感優先級**：無法處理同時有多個情感標籤的情況

## 未來改進方向

- [ ] 根據句子長度動態調整表情變化時機
- [ ] 加入更多嘴型變化（如 "i", "u" 等）
- [ ] 根據音訊頻率分析選擇合適的嘴型
- [ ] 支援自定義表情變化時間線
- [ ] 加入微表情系統（眨眼、挑眉等）

