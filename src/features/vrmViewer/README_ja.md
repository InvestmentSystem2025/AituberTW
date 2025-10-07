# VRM ビューアー (VRM Viewer)

VRM ビューアーは AITUBER Kit において 3D バーチャルキャラクターを管理するコアモジュールで、VRM (Virtual Reality Model) 形式の 3D キャラクターの読み込み、アニメーション再生、音声同期、感情表現をサポートします。

## 主要機能

### 🎭 感情タグ表情制御システム

このシステムの核心的な特徴は、感情タグ (Emotion Tags) を通じて 3D キャラクターの表情変化を制御することです。システムは以下の 6 つの基本感情をサポートしています：

- **neutral** - 中性表情（デフォルト）
- **happy** - 嬉しい表情
- **angry** - 怒った表情
- **sad** - 悲しい表情
- **relaxed** - リラックスした表情
- **surprised** - 驚いた表情

### 📁 ファイル構造

```
vrmViewer/
├── model.ts              # メインの Model クラス
├── README.md             # 英語版説明書
├── README_ja.md          # 日本語版説明書
└── (関連依存モジュール)
    ├── emoteController/   # 感情コントローラー
    ├── lipSync/          # 音声同期
    └── messages/         # メッセージと感情タイプ定義
```

## コアクラス：Model

`Model` クラスは VRM ビューアーの主要エントリーポイントで、以下の機能を提供します：

### 🔧 主要メソッド

#### `loadVRM(url: string): Promise<void>`
VRM モデルファイルを読み込む
```typescript
const model = new Model(lookAtTargetParent)
await model.loadVRM('/path/to/character.vrm')
```

#### `speak(buffer: ArrayBuffer, talk: Talk, isNeedDecode?: boolean)`
音声を再生し、表情を同期する
```typescript
const talk: Talk = {
  emotion: 'happy',  // 感情タグ
  message: 'こんにちは！',
  buffer: audioBuffer
}
await model.speak(audioBuffer, talk)
```

#### `playEmotion(preset: VRMExpressionPresetName)`
指定された感情表情を直接再生
```typescript
model.playEmotion('happy')    // 嬉しい表情を表示
model.playEmotion('sad')      // 悲しい表情を表示
model.playEmotion('neutral')  // 中性表情に戻る
```

#### `loadAnimation(vrmAnimation: VRMAnimation): Promise<void>`
VRM アニメーションを読み込んで再生
```typescript
await model.loadAnimation(vrmAnimationData)
```

### 🎯 感情タグ使用例

#### 1. 音声再生時の自動感情適用
```typescript
// AI アシスタントが話す際、感情タグに基づいて自動的に対応する表情を表示
const talk: Talk = {
  emotion: 'surprised',  // 驚きの感情タグ
  message: '本当ですか？とても驚きました！',
  buffer: audioBuffer
}
await model.speak(audioBuffer, talk)
```

#### 2. 手動での感情表情制御
```typescript
// 会話中に手動で表情を切り替え
model.playEmotion('happy')     // 嬉しい表情を表示
await new Promise(resolve => setTimeout(resolve, 2000))  // 2秒待機
model.playEmotion('neutral')   // 中性表情に戻る
```

#### 3. 感情タグと AI 会話の統合
```typescript
// AI 応答時には自動的に感情タグが含まれる
const aiResponse = {
  message: '今日はいい天気ですね！',
  emotion: 'happy'  // AI 分析による感情タグ
}

const talk: Talk = {
  emotion: aiResponse.emotion,
  message: aiResponse.message,
  buffer: generatedAudioBuffer
}
await model.speak(talk.buffer, talk)
```

## 🏗️ システムアーキテクチャ

### 感情制御フロー

```
AI 会話生成 → 感情分析 → 感情タグ → EmoteController → ExpressionController → VRM 表情
```

1. **AI 応答生成** - テキストと感情分析を含む
2. **感情タグ抽出** - AI 応答から感情タイプを抽出
3. **表情コントローラー** - `EmoteController` が感情変換を処理
4. **表現コントローラー** - `ExpressionController` が VRM 表情ブレンドを管理
5. **表情適用** - VRM モデルに対応する表情を表示

### 依存モジュール

- **EmoteController** - 感情表現コントローラー
- **ExpressionController** - VRM 表情管理
- **LipSync** - 音声同期システム
- **AutoBlink** - 自動まばたきシステム
- **AutoLookAt** - 自動視線追跡

## ⚙️ 設定オプション

### 環境変数設定

`.env` ファイルで関連設定を構成できます：

```env
# VRM モデルパス
NEXT_PUBLIC_SELECTED_VRM_PATH=/path/to/character.vrm

# キャラクター位置と回転
NEXT_PUBLIC_FIXED_CHARACTER_POSITION=true
NEXT_PUBLIC_CHARACTER_POSITION_X=0
NEXT_PUBLIC_CHARACTER_POSITION_Y=-1
NEXT_PUBLIC_CHARACTER_POSITION_Z=0

# 照明強度
NEXT_PUBLIC_LIGHTING_INTENSITY=1.0
```

### コード設定

```typescript
// VRM ビューアーの初期化
const lookAtTargetParent = new THREE.Object3D()
const model = new Model(lookAtTargetParent)

// 更新ループの設定
function animate() {
  const delta = clock.getDelta()
  model.update(delta)
  requestAnimationFrame(animate)
}
```

## 🔄 更新ループ

Model クラスは毎フレーム更新で `update(delta)` メソッドを呼び出す必要があります：

```typescript
public update(delta: number): void {
  // 音声同期の更新
  if (this._lipSync) {
    const { volume } = this._lipSync.update()
    this.emoteController?.lipSync('aa', volume)
  }
  
  // 感情コントローラーの更新
  this.emoteController?.update(delta)
  
  // アニメーションミキサーの更新
  this.mixer?.update(delta)
  
  // VRM モデルの更新
  this.vrm?.update(delta)
}
```

## 🎨 表情ブレンドメカニズム

システムは複数の表情の滑らかなブレンドをサポートします：

- **中性表情** - デフォルト状態、自動まばたきをサポート
- **感情表情** - 感情タグに基づいて対応する表情を表示
- **音声同期** - 音量に基づいて口の形を調整
- **表情変換** - 異なる感情表情間の滑らかな切り替え

## 📝 注意事項

1. **VRM モデル要件** - 読み込む VRM モデルが表情ブレンド (BlendShape) をサポートしていることを確認
2. **音声形式** - 音声同期は複数の音声形式をサポート、WAV や MP3 の使用を推奨
3. **パフォーマンス考慮** - 大きな VRM モデルはレンダリング性能に影響する可能性
4. **ブラウザ互換性** - WebGL をサポートするモダンブラウザが必要

## 🔗 関連リソース

- [VRM 公式ドキュメント](https://vrm.dev/)
- [Three.js VRM 拡張](https://github.com/pixiv/three-vrm)
- [VRM 仕様書](https://github.com/vrm-c/vrm-specification)

---

*このモジュールは AITUBER Kit のコアコンポーネントで、AI バーチャルアナウンサーに豊かな感情表現能力を提供します。*

