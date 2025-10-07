# VRM 檢視器 (VRM Viewer)

VRM 檢視器是 AITUBER Kit 中負責管理 3D 虛擬角色的核心模組，支援 VRM (Virtual Reality Model) 格式的 3D 角色載入、動畫播放、語音同步和情感表達。

## 主要功能

### 🎭 情感標籤表情控制系統

本系統的核心特色是透過情感標籤 (Emotion Tags) 來控制 3D 角色的表情變化。系統支援以下六種基本情感：

- **neutral** - 中性表情（預設）
- **happy** - 開心表情
- **angry** - 憤怒表情
- **sad** - 悲傷表情
- **relaxed** - 放鬆表情
- **surprised** - 驚訝表情

### 📁 檔案結構

```
vrmViewer/
├── model.ts              # 主要的 Model 類別
├── README.md             # 本說明文件
└── (相關依賴模組)
    ├── emoteController/   # 情感控制器
    ├── lipSync/          # 語音同步
    └── messages/         # 訊息和情感類型定義
```

## 核心類別：Model

`Model` 類別是 VRM 檢視器的主要入口點，提供以下功能：

### 🔧 主要方法

#### `loadVRM(url: string): Promise<void>`
載入 VRM 模型檔案
```typescript
const model = new Model(lookAtTargetParent)
await model.loadVRM('/path/to/character.vrm')
```

#### `speak(buffer: ArrayBuffer, talk: Talk, isNeedDecode?: boolean)`
播放語音並同步表情
```typescript
const talk: Talk = {
  emotion: 'happy',  // 情感標籤
  message: '你好！',
  buffer: audioBuffer
}
await model.speak(audioBuffer, talk)
```

#### `playEmotion(preset: VRMExpressionPresetName)`
直接播放指定情感表情
```typescript
model.playEmotion('happy')    // 顯示開心表情
model.playEmotion('sad')      // 顯示悲傷表情
model.playEmotion('neutral')  // 回到中性表情
```

#### `loadAnimation(vrmAnimation: VRMAnimation): Promise<void>`
載入並播放 VRM 動畫
```typescript
await model.loadAnimation(vrmAnimationData)
```

### 🎯 情感標籤使用範例

#### 1. 在語音播放時自動應用情感
```typescript
// 當 AI 助手說話時，會根據情感標籤自動顯示對應表情
const talk: Talk = {
  emotion: 'surprised',  // 驚訝情感標籤
  message: '真的嗎？太令人驚訝了！',
  buffer: audioBuffer
}
await model.speak(audioBuffer, talk)
```

#### 2. 手動控制情感表情
```typescript
// 在對話過程中手動切換表情
model.playEmotion('happy')     // 顯示開心表情
await new Promise(resolve => setTimeout(resolve, 2000))  // 等待 2 秒
model.playEmotion('neutral')   // 回到中性表情
```

#### 3. 情感標籤與 AI 對話整合
```typescript
// AI 回應時會自動包含情感標籤
const aiResponse = {
  message: '今天天氣真好！',
  emotion: 'happy'  // AI 分析後的情感標籤
}

const talk: Talk = {
  emotion: aiResponse.emotion,
  message: aiResponse.message,
  buffer: generatedAudioBuffer
}
await model.speak(talk.buffer, talk)
```

## 🏗️ 系統架構

### 情感控制流程

```
AI 對話生成 → 情感分析 → 情感標籤 → EmoteController → ExpressionController → VRM 表情
```

1. **AI 生成回應** - 包含文字和情感分析
2. **情感標籤提取** - 從 AI 回應中提取情感類型
3. **表情控制器** - `EmoteController` 處理情感轉換
4. **表達控制器** - `ExpressionController` 管理 VRM 表情混合
5. **表情應用** - 在 VRM 模型上顯示對應表情

### 依賴模組

- **EmoteController** - 情感表達控制器
- **ExpressionController** - VRM 表情管理
- **LipSync** - 語音同步系統
- **AutoBlink** - 自動眨眼系統
- **AutoLookAt** - 自動視線追蹤

## ⚙️ 配置選項

### 環境變數設定

在 `.env` 檔案中可以配置相關設定：

```env
# VRM 模型路徑
NEXT_PUBLIC_SELECTED_VRM_PATH=/path/to/character.vrm

# 角色位置和旋轉
NEXT_PUBLIC_FIXED_CHARACTER_POSITION=true
NEXT_PUBLIC_CHARACTER_POSITION_X=0
NEXT_PUBLIC_CHARACTER_POSITION_Y=-1
NEXT_PUBLIC_CHARACTER_POSITION_Z=0

# 燈光強度
NEXT_PUBLIC_LIGHTING_INTENSITY=1.0
```

### 程式碼配置

```typescript
// 初始化 VRM 檢視器
const lookAtTargetParent = new THREE.Object3D()
const model = new Model(lookAtTargetParent)

// 設定更新循環
function animate() {
  const delta = clock.getDelta()
  model.update(delta)
  requestAnimationFrame(animate)
}
```

## 🔄 更新循環

Model 類別需要在每幀更新中呼叫 `update(delta)` 方法：

```typescript
public update(delta: number): void {
  // 更新語音同步
  if (this._lipSync) {
    const { volume } = this._lipSync.update()
    this.emoteController?.lipSync('aa', volume)
  }
  
  // 更新情感控制器
  this.emoteController?.update(delta)
  
  // 更新動畫混合器
  this.mixer?.update(delta)
  
  // 更新 VRM 模型
  this.vrm?.update(delta)
}
```

## 🎨 表情混合機制

系統支援多種表情的平滑混合：

- **中性表情** - 預設狀態，支援自動眨眼
- **情感表情** - 根據情感標籤顯示對應表情
- **語音同步** - 根據音量調整嘴型
- **表情轉換** - 平滑切換不同情感表情

## 📝 注意事項

1. **VRM 模型要求** - 確保載入的 VRM 模型支援表情混合 (BlendShape)
2. **音訊格式** - 語音同步支援多種音訊格式，建議使用 WAV 或 MP3
3. **效能考量** - 大型 VRM 模型可能影響渲染效能
4. **瀏覽器相容性** - 需要支援 WebGL 的現代瀏覽器

## 🔗 相關資源

- [VRM 官方文件](https://vrm.dev/)
- [Three.js VRM 擴展](https://github.com/pixiv/three-vrm)
- [VRM 規格說明](https://github.com/vrm-c/vrm-specification)

---

*此模組是 AITUBER Kit 的核心組件，為 AI 虛擬主播提供豐富的情感表達能力。*

