## AITuberKit 迅速インストールとワンクリック起動（Docker + Ollama）

本ドキュメントは新規メンバーが最短で開発環境を構築できるよう、Ollama のモデル取得、Embedding モデルのダウンロード、ChromaDB、n8n（手動インポート）およびアプリ起動・検証までを一括で案内します。

参照元（既存資産）：`docker-compose.ollama.yml`、`scripts/*`、`docs/*`、`README_OLD.md`。

---

### 前提条件

- Docker Desktop（Windows は WSL2 推奨）
- PowerShell（Windows。VSCode 内のターミナル推奨）
- NVIDIA GPU 推奨（`docker-compose.ollama.yml` は GPU を前提）。GPU が無い場合は後述の「トラブルシューティング」を参照し CPU モードに変更してください。

---

### ワンクリックセットアップ（推奨）

- 実行環境：VSCode PowerShell ターミナル（Docker コンテナ内ではありません）

1) 初回のみ PowerShell スクリプト実行許可

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

2) 一括起動（チャットモデルと埋め込みモデルの取得、全サービス起動）

```powershell
./scripts/setup-all.ps1
```

オプション：

- テストをスキップ：

```powershell
./scripts/setup-all.ps1 -SkipTests
```

- n8n を起動しない：

```powershell
./scripts/setup-all.ps1 -SkipN8N
```

- モデルを指定：

```powershell
./scripts/setup-all.ps1 -ChatModel "gpt-oss:20b" -EmbeddingModel "jeffh/intfloat-multilingual-e5-large-instruct:f16"
```

スクリプトの実行内容：

- Docker 稼働チェック
- `.env` の自動作成/複製（`.env.example` があればコピー）
- `docker-compose.ollama.yml` で `ollama`、`chromadb`、`n8n`、`app` を起動
- サービス起動待ち（11434/8000/5678/3000）
- チャットモデル・埋め込みモデルの存在確認と不足分の取得
- 任意で検証テスト実行（`test-ollama.ps1`、`test-embedding.ps1`、`test-integration.ps1`）

---

### 手動セットアップ（必要な場合）

- 実行環境：VSCode PowerShell ターミナル（Docker コンテナ内ではありません）

1) コアサービス起動（Ollama + ChromaDB）

```powershell
docker compose -f docker-compose.ollama.yml up -d ollama chromadb
# 旧バージョンの Docker: docker-compose -f docker-compose.ollama.yml up -d ollama chromadb
```

2) モデル取得（コンテナ内）

- 実行環境：Docker コンテナ内（`ollama`）

```powershell
docker exec ollama ollama pull gpt-oss:20b
docker exec ollama ollama pull jeffh/intfloat-multilingual-e5-large-instruct:f16
```

3) n8n（任意）とアプリ起動

```powershell
docker compose -f docker-compose.ollama.yml up -d n8n app
```

4) サービス状態確認

```powershell
docker compose -f docker-compose.ollama.yml ps
docker logs ollama
docker logs chromadb
docker logs app
docker logs n8n
```

---

### 環境変数

ワンクリックスクリプトは `.env` を自動生成（または `.env.example` から複製）します。主要な変数：

```
OLLAMA_BASE_URL=http://ollama:11434
CHROMA_URL=http://chromadb:8000
OLLAMA_EMBEDDING_MODEL=jeffh/intfloat-multilingual-e5-large-instruct:f16
```

モデルを変更したい場合は `setup-all.ps1` の引数指定、または `.env` / `docker-compose.ollama.yml` を編集してください。

---

### 検証・テスト

- 実行環境：VSCode PowerShell ターミナル（Docker コンテナ内ではありません）

1) Ollama テスト（モデル列挙・チャット・ストリーミング）

```powershell
./scripts/test-ollama.ps1
```

2) Embedding テスト（多言語・次元数・性能）

```powershell
./scripts/test-embedding.ps1
```

3) 統合テスト（チャット + 埋め込み + 併行実行 + アプリ健全性）

```powershell
./scripts/test-integration.ps1
```

4) ブラウザ用テストページ（実行環境：ブラウザ）

- `http://localhost:3000/test-embedding-manual.html`
- `http://localhost:3000/test-rag-integration.html`
- `http://localhost:3000/test-news.html`

---

### n8n 手動設定（RSS ニュース自動化）

- 実行環境：ブラウザ（管理 UI）／VSCode PowerShell（起動・確認）

1) n8n 起動確認：

```powershell
docker compose -f docker-compose.ollama.yml up -d n8n
```

2) `http://localhost:5678` を開き、UI から `n8n-workflows/RSS_News_Automation.json` をインポート

3) 必要に応じて RSS ソース（`n8n-workflows/RSS_Sources.md`）を調整し、ワークフローを有効化して実行テスト

補助スクリプト：

```powershell
# n8n の起動と基本チェック
./scripts/setup-n8n.ps1

# n8n の起動待ちとニュース API 連携テスト
./scripts/setup-n8n-workflow.ps1
```

---

### RAG（Retrieval-Augmented Generation）

- 主要サービス：ChromaDB（`http://localhost:8000`）
- 参考ドキュメント：`docs/rag-integration-guide.md`

心拍確認（実行環境：VSCode PowerShell）：

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/heartbeat" -Method Get
```

サンプルドキュメント投入や追加チェックが必要な場合：

```powershell
./scripts/setup-rag.ps1
```

---

### トラブルシューティング

- サービスが起動しない / タイムアウト：
  - Docker の稼働とメモリ割当（8GB 以上推奨）を確認
  - ログ確認：`docker logs ollama`、`docker logs chromadb`、`docker logs app`、`docker logs n8n`
  - 再起動：`docker compose -f docker-compose.ollama.yml restart`

- モデルダウンロードが遅い / 失敗する：
  - リトライ：`docker exec ollama ollama pull gpt-oss:20b`
  - ネットワークと空き容量（20GB 以上目安）を確認

- GPU 関連エラー：
  - NVIDIA ドライバと Docker Desktop の GPU サポート（Windows は WSL2）を確認
  - GPU 非搭載の場合は CPU モードへ：`docker-compose.ollama.yml` から `gpus` と `nvidia` 関連の設定、`CUDA_VISIBLE_DEVICES`／`NVIDIA_VISIBLE_DEVICES` を削除

- ポート競合：
  - `docker-compose.ollama.yml` の `ports` を適宜変更

---

### 重要リンク・ライセンス

- 詳細ドキュメント：`docs/README_zh.md`、`docs/ollama-setup-guide.md`、`docs/rag-integration-guide.md`
- 追加の検証ページ：`public/test-rag-integration.html`、`public/test-embedding-manual.html`
- ライセンス・利用規約：`docs/license.md`、`docs/logo_licence.md`、`docs/character_model_licence.md`

---

### 開発者向けコマンド（すべて VSCode PowerShell で実行）

```powershell
# すべて起動（n8n を含む）
docker compose -f docker-compose.ollama.yml up -d

# 停止・削除
docker compose -f docker-compose.ollama.yml down

# app のみ起動
docker compose -f docker-compose.ollama.yml up -d app

# 状態 / ログ
docker compose -f docker-compose.ollama.yml ps
docker logs app

# app の再ビルド（Dockerfile や依存を変更した場合）
docker compose -f docker-compose.ollama.yml build app
docker compose -f docker-compose.ollama.yml up -d app
```

---

不足や追加自動化の要望があれば Issue / PR をお願いします。本ドキュメントはスクリプト更新に合わせて継続的に改善します。


