# AGENTS.md

這份文件是本專案給 Codex/AI coding agent 使用的工作規範。請在修改程式碼、撰寫指令、執行 migration、或回覆實作結果時遵守。

## 專案工程原則

實作功能時，效能、擴充性與安全性都視為預設需求，不要把它們留到事後最佳化。

優先順序：

1. 先確保正確性，再處理效率；明顯 hot path 要主動避免低效實作。
2. 在 Next.js 環境中預設維持 CSP 與 SSR 安全。
3. 避免重複查詢、重複外部呼叫、重複昂貴運算。

## 資料存取規則

- 同一個 request 生命週期內，不要針對同一 entity 重複讀取相同資料；應一次取得必要欄位並重用。
- 列表、批次、歷史紀錄、dashboard、admin 類畫面要避免 N+1 query。優先使用 join、batch query、`IN` query、preload 或 aggregation。
- auth、profile、membership、quota、permission 等查詢應集中在 middleware、auth context 或 service layer，不要在多個 handler 重複實作。
- 高頻率但低變動資料，例如 app settings、feature flags、model metadata、role mapping，預設考慮短 TTL cache。
- 新增 hot query 時，要檢查 `WHERE`、`ORDER BY`、`JOIN` 欄位是否需要 index，並在回覆中說明建議。

## Cache 策略

- Request-scope reuse：同一 request 內可重用的資料，應在 request 生命週期內快取。
- Cross-request hot data：跨 request 的熱門資料，優先使用短 TTL cache。
- 未指定 TTL 時的預設值：
  - config-like data：300 秒
  - 可接受短暫延遲的 mutable data：60 秒
- Cache key 必須包含相關的 tenant、user、locale、role、feature 維度。
- Cache 不得破壞 permission boundary，也不得造成跨 tenant/user 資料外洩。
- 需要快速一致性的資料，應加入 invalidate-on-write，不要只依賴 TTL。

## 外部呼叫與昂貴運算

- 同一個 logical flow 內，避免重複呼叫 LLM、外部 API、vector search、檔案讀取等昂貴操作。
- SDK client、parser、schema、service instance 等昂貴物件應重用，不要在 hot path 反覆建立。
- 避免在高頻路徑中反覆進行大型 JSON serialize/parse。
- 對 deterministic 且昂貴的運算，可使用 memoization/cache，但必須有清楚的 invalidation 語意。

## Next.js、CSP 與 SSR 安全

本專案預設需要考慮 strict CSP 與 SSR safety。

- 如果同一份資料同時在 Server Component、Client Component、API route 被抓取，應整合到共用 service access，避免重複 fetch。
- dashboard、history、admin、列表類畫面要特別檢查是否有重複 user/profile/membership 讀取，以及 per-row related-data query。
- 避免在 app code 中使用 inline script。
- 避免在會經過 SSR 的路徑中，於 module scope import browser-only library。
- 在 strict CSP 下，優先使用 Tailwind class、CSS class、SVG attribute 或既有樣式系統；避免會注入 runtime `<style>` 或大量 inline style 的第三方 chart library。
- 動態圖表或視覺元素若需要 CSP-safe 實作，優先考慮純 SVG 或 client-only dynamic import。

範例：

```tsx
// 不建議：可能被 CSP 擋下
<div style={{ width: '60%' }} />

// 建議：使用 class 或 SVG attribute
<div className="w-1/2" />
<svg viewBox="0 0 200 8" className="w-full">
  <rect x={0} y={0} width={pct * 2} height={8} className="fill-emerald-400" rx={4} />
</svg>
```

```tsx
// 不建議：browser-only library 可能造成 SSR crash
// import { LineChart } from 'recharts'

// 建議：在 page/parent level 使用 client-only dynamic import
const MyChart = dynamic(() => import('@/components/MyChart'), { ssr: false })
```

## 每次程式修改後的回覆要求

回覆實作結果時，請包含：

1. 功能修改內容
2. 效能防護：說明是否有 dedupe、cache、batch、centralize 等處理
3. 潛在風險點：包含 cache consistency、stale data、permission boundary、hotspot 等

如果新增 DB query，請另外說明：

- query 在哪裡被呼叫
- 預估呼叫頻率
- hotspot 風險
- 是否需要 index、cache、preload 或 batch

如果沒有做最佳化，請明確說明目前不需要的原因。

## VM 與遠端 Linux 指令格式

提供 VM 或遠端 Linux 環境使用的指令時，預設使用 Linux command format，除非使用者明確指定 Windows 或 PowerShell。

- 使用 `/` 路徑分隔符。
- 避免 Windows `.\` 形式的相對路徑。
- 需要使用者在 VM、WSL 或遠端 Linux shell 複製貼上的命令，避免提供容易被畫面折行切壞的超長單行；預設使用 `\` 續行格式。尤其是 redirection，例如 `< supabase/migrations/...`，不得拆成無 `\` 的兩行。
- 提供臨時 SQL / DB 修正指令時，優先使用 `psql -c "..."` 搭配多行雙引號字串，不要使用 heredoc（例如 `<<'SQL' ... SQL`），避免使用者複製時因結束符前有空白而卡在 shell 的 `>` 續行提示。

## Supabase Migration 執行規則

如果新增 `supabase/migrations/` 底下的 migration 檔案，只 push/pull 程式碼是不夠的，SQL 必須實際套用到目標資料庫環境。

必要步驟：

1. 確認新增的 migration 檔案，例如 `supabase/migrations/20260330_example.sql`。
2. 預設優先使用 docker compose service name `supabase-db`，不要依賴會隨專案 prefix 改變的 container name。
3. 如果存在多個 compose file，必須明確指定，不要依賴隱含預設值。
4. 本機 DB 套用範例：

```bash
docker compose -f docker-compose.yml exec -T supabase-db \
  psql -U postgres -d postgres -f /dev/stdin \
  < supabase/migrations/<migration-file>.sql
```

5. VM/GCP DB 套用範例：

```bash
docker compose -f docker-compose.gcp.yml exec -T supabase-db \
  psql -U postgres -d postgres -f /dev/stdin \
  < supabase/migrations/<migration-file>.sql
```

6. 每個環境套用後都要驗證 schema change，例如：

```bash
docker compose -f <compose-file>.yml exec -T supabase-db \
  psql -U postgres -d postgres \
  -c "\d+ public.resume_review_requests"
```

7. 只有在 compose context 不可用時，才偵測 container name 並改用 `docker exec`。
8. SQL 優先寫成 idempotent，例如使用 `IF EXISTS` / `IF NOT EXISTS`。
9. destructive change 必須在 PR note 或回覆中說明 rollback strategy。
