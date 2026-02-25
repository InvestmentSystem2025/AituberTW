---
name: GCP prod+stg stable env deploy
overview: Prod VM 與 Staging VM 完全隔離、同一份 `docker-compose.gcp.yml` 當 base，所有環境差異只靠 `docker compose --env-file .env.prod/.env.stg` 注入；stg 前台才套 Caddy Basic Auth（帳密用 env hash），supabase-stg 不加；移除所有 production fallback default，並確保 stg 可完成登入流程以支援 authenticated ZAP。
todos:
  - id: compose-no-envfile-layer
    content: "在 `docker-compose.gcp.yml` 移除 service `env_file: - .env`，改由 `environment:` 以 `${VAR}` 明確傳入需要的變數；並把所有 hardcode/`:-https://...` fallback 全數改成純 `${VAR}`"
    status: pending
  - id: caddy-split-and-stg-auth
    content: 新增 `Caddyfile.prod`/`Caddyfile.stg`，stg 前台加 `basicauth {env.BASIC_AUTH_USER} {env.BASIC_AUTH_PASS_HASH}`，supabase-stg 不加；compose 掛載用 `${CADDYFILE_NAME}`
    status: pending
  - id: kong-config-minimal-split
    content: 新增 `supabase/kong.gcp.prod.yml`/`supabase/kong.gcp.stg.yml`，兩份僅 CORS origins 不同；compose 掛載用 `${KONG_CONFIG_NAME}`
    status: pending
  - id: env-examples-and-ignore
    content: 新增 `.env.prod.example`/`.env.stg.example`（無 secrets）；更新 `.gitignore` 忽略 `.env.prod/.env.stg`
    status: pending
  - id: acceptance-login-and-zap
    content: 依驗收條件驗證 prod/stg；stg 需在初始化階段建立「ZAP 專用帳號」（email 已確認、已設密碼、已標記 MFA gate 完成、ToS 已同意），並確認可登入後爬入 authenticated routes（ZAP authenticated spider）
    status: pending
isProject: false
---

## 你已確認的前提（納入本 plan）

- **Prod VM 與 Staging VM 同時存在且完全隔離**（不在同一台 VM 跑 prod+stg）。
- **Staging VM 平時停止**，需要掃描才啟動；DNS 永遠各自指向各自 static IP。
- **同一份** `[docker-compose.gcp.yml](c:/dev/AITUBER/aituber-kit/docker-compose.gcp.yml)` 當 base。
- **所有環境差異只靠 `--env-file**`（不再做 `ENV_FILE` 套娃，也不在 compose 內硬寫網域）。
- **Basic Auth 只套 stg 前台**；`supabase-stg` 不加 Basic Auth。

## 最重要的技術澄清（為什麼要動 compose 的 `env_file:`）

`docker compose --env-file .env.stg` 只影響 **compose 變數展開**（`${VAR}`），不會自動把整份 `.env.stg` 注入到容器環境。
因此要達成你要的「**所有 service 內部的 `${VAR}` 直接從 `--env-file` 來**」且避免雙來源，我們會：

- **移除/不使用 service 的 `env_file: - .env**`（避免容器再去讀另一份 `.env`）。
- 改成每個 service 用 `environment:` 明確列出需要的變數（值全部寫 `${VAR_NAME}`），讓 compose 透過 `--env-file` 展開後傳入容器。

這是最單純、最穩定、也最符合你「不要三層展開」的做法。

## 需要移除的 production fallback / hardcode（我已定位）

在 `docker-compose.gcp.yml` 目前看到的硬寫或 fallback：

- `NEXT_PUBLIC_SUPABASE_URL=https://supabase.ai-interview.tw`
- `GOTRUE_SITE_URL: ${AUTH_REDIRECT_URL:-https://ai-interview.tw}`（即使可覆寫，仍會在缺值時回落 prod，必須移除 `:-...`）
- `GOTRUE_MAILER_DEFAULT_REDIRECT_URL: ${SMTP_DEFAULT_REDIRECT_URL:-https://ai-interview.tw}`
- `GOTRUE_EXTERNAL_URL / GOTRUE_API_EXTERNAL_URL / API_EXTERNAL_URL` 內含 `:-https://supabase.ai-interview.tw`
- `SUPABASE_URL: ${SITE_URL:-https://supabase.ai-interview.tw}`
- `FRONTEND_ORIGIN: ${FRONTEND_ORIGIN:-https://ai-interview.tw}`

另外 `supabase/kong.gcp.yml` 也有 hardcode CORS origin：

- `origins: - "https://ai-interview.tw"`

## 方案（最小變更，長期最穩）

### A) `docker-compose.gcp.yml`：只做「參數化值」，不做 `ENV_FILE` 套娃

- **不再**在任何 service 使用 `.env` 檔注入（移除/停用 `env_file: - .env`）。
- **所有網域/URL/redirect/origin** 都改成純變數（完全移除 `:-https://...`）：
  - `NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}`
  - `GOTRUE_SITE_URL=${GOTRUE_SITE_URL}`
  - `GOTRUE_MAILER_DEFAULT_REDIRECT_URL=${GOTRUE_MAILER_DEFAULT_REDIRECT_URL}`
  - `GOTRUE_EXTERNAL_URL=${GOTRUE_EXTERNAL_URL}`
  - `GOTRUE_API_EXTERNAL_URL=${GOTRUE_API_EXTERNAL_URL}`
  - `API_EXTERNAL_URL=${API_EXTERNAL_URL}`
  - `SUPABASE_URL=${SUPABASE_URL}`
  - `FRONTEND_ORIGIN=${FRONTEND_ORIGIN}`
  - `SUPABASE_AUTH_PUBLIC_URL=${SUPABASE_AUTH_PUBLIC_URL}`（若當前 compose 有用到/需要對齊前端）
- **保留你認可的參數化掛載**：
  - Caddy：`./${CADDYFILE_NAME}:/etc/caddy/Caddyfile:ro`
  - Kong：`./supabase/${KONG_CONFIG_NAME}:/var/lib/kong/kong.yml:ro`

> 你指定的啟動方式會成為唯一規範：
>
> - prod VM：`docker compose --env-file .env.prod -f docker-compose.gcp.yml up -d --build`
> - stg VM：`docker compose --env-file .env.stg -f docker-compose.gcp.yml up -d --build`

### B) Caddy：維持 `Caddyfile.prod / Caddyfile.stg`，stg 前台才 basicauth

- `Caddyfile.prod`：
  - `ai-interview.tw` → `reverse_proxy app:3000`
  - `supabase.ai-interview.tw` → `reverse_proxy supabase-kong:8000`
  - **不含 basicauth**
- `Caddyfile.stg`：
  - `stg.ai-interview.tw`：
    - `basicauth {env.BASIC_AUTH_USER} {env.BASIC_AUTH_PASS_HASH}`
    - `reverse_proxy app:3000`
  - `supabase-stg.ai-interview.tw`：
    - `reverse_proxy supabase-kong:8000`
    - **不含 basicauth**
- `.env.prod`：`CADDYFILE_NAME=Caddyfile.prod`
- `.env.stg`：`CADDYFILE_NAME=Caddyfile.stg` + `BASIC_AUTH_*`

### C) Kong config：保留分離但簡化（只差 CORS origins）

- 新增：
  - `supabase/kong.gcp.prod.yml`
  - `supabase/kong.gcp.stg.yml`
- **保證兩份檔案除了 CORS origins 完全一致**（routes/service/url 不改、不重構）。
  - prod origins：`https://ai-interview.tw`
  - stg origins：`https://stg.ai-interview.tw`
- `.env.prod`：`KONG_CONFIG_NAME=kong.gcp.prod.yml`
- `.env.stg`：`KONG_CONFIG_NAME=kong.gcp.stg.yml`

### D) 提供兩份環境檔範本（不放 secrets）

- 新增：
  - `.env.prod.example`
  - `.env.stg.example`
- **只放 key 名稱與範例值**（不放真的 secret，不放真正 key）。
- VM 真正使用（不 commit）：
  - `.env.prod`
  - `.env.stg`
- 更新 `.gitignore`：確保 `.env.prod`、`.env.stg` 被忽略。

## stg 必須可完整登入（新增你要求的驗收重點）

要支援 authenticated ZAP（且**不讓 ZAP 自行註冊**，避免 email 驗證 + MFA 的複雜流程），stg 需要在初始化階段先建立一個「ZAP 專用帳號」，並確保可完整登入與爬蟲進入需登入頁面。

- **Email + Password 登入流程可用**
  - ZAP 專用帳號必須「email 已確認」且已設定密碼（ZAP 不負責註冊/驗證）。
- **Redirect 回 `stg.ai-interview.tw**`
  - `GOTRUE_SITE_URL` 與相關 redirect 變數要指向 stg 前台。
- **Cookie domain/secure 正確**
  - 以 HTTPS + 正確 host 測試 session cookie（避免誤設成 prod domain 或被 Basic Auth 影響 API）。
- **ZAP 可設定 authenticated scan**
  - 先通過 stg 前台 Basic Auth，再用 ZAP 專用帳號登入應用，讓 spider 可爬入 authenticated routes。

### Staging 初始化：建立 ZAP 專用帳號（優先走 Supabase Admin API / service role）

目標：**不修改 production auth flow**、**不關閉 MFA globally**、**不新增 bypass endpoint**，但讓 stg 有一個可用於 ZAP 的已驗證帳號。

關鍵背景（依目前程式碼）：本專案的 MFA gate 依據是 `public.profiles.mfa_totp_enabled_at`（前端登入後呼叫 `/api/me/mfa` 判斷，未完成就導去 `/mfa/setup`）。因此 ZAP 帳號需要在 stg 初始化時被標記為「已完成 MFA gate」。

建議實作方式（一次性 bootstrap job/container，僅 stg 環境啟用）：

- **Step 1：用 GoTrue Admin API 建立使用者（email 已確認 + 密碼）**
  - 目標：建立 `auth.users`（避免直接 SQL insert）
  - 走內網 Kong（容器網路內）：`http://supabase-kong:8000/auth/v1/admin/users`
  - Headers（service role）：`Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`、`apikey: ${SUPABASE_SERVICE_ROLE_KEY}`
  - Body：包含 `email`、`password`、`email_confirm: true`
  - 取得回傳的 `user.id`（auth user id）
- **Step 2：用 PostgREST（service role）建立/更新 profile，並標記 MFA gate 已完成**
  - 走內網 Kong：`http://supabase-kong:8000/rest/v1/profiles?on_conflict=auth_id`
  - Upsert 欄位（最少）：`auth_id`、`email`、`role`、`mfa_totp_enabled_at`（設為當前時間）
  - 目的：讓 `/api/me/mfa` 回 `mfa_enabled: true`，避免被導去 `/mfa/setup`
- **Step 3：將 ToS 設為已同意最新版（避免登入後被導去 `/tos`）**
  - 先用 RPC 取得最新版：`POST http://supabase-kong:8000/rest/v1/rpc/get_latest_tos_version`
  - 再 upsert `public.profile_tos_acceptances`（service role）寫入 acceptance（需要 `profile_id`、`terms_version` 等欄位）

stg `.env.stg` 建議新增（僅 stg 用）：

- `ZAP_SEED_EMAIL`（例：`zap@stg.example.com`）
- `ZAP_SEED_PASSWORD`（例：`ChangeMe_Strong_Password_123!`）
- `ZAP_SEED_ROLE`（例：`recruiter`；依你們要掃的頁面需要哪個角色決定）

注意：

- 這個 seed job **只在 stg VM 跑**（prod VM 不啟用/不提供 seed 變數），確保不影響 production。
- 若 ZAP 帳號已存在，seed job 應設計為冪等（create 失敗時改用查詢/更新；或先查再建）。

## 驗收條件（完整列表）

- **Prod**
  - `ai-interview.tw` 與 `supabase.ai-interview.tw` 正常服務。
  - **不會被 stg basicauth 影響**（prod VM 使用 `Caddyfile.prod`，且 prod env 不帶 `BASIC_AUTH_*`）。
- **Staging**
  - `stg.ai-interview.tw`：未帶帳密 **401**；帶正確 Basic Auth **200**。
  - `supabase-stg.ai-interview.tw/auth/v1/health`：**200**（不需要 Basic Auth）。
  - Next 前端呼叫 Supabase URL 隨環境切換：
    - prod：`NEXT_PUBLIC_SUPABASE_URL=https://supabase.ai-interview.tw`
    - stg：`NEXT_PUBLIC_SUPABASE_URL=https://supabase-stg.ai-interview.tw`
  - **ZAP 專用帳號可正常登入**（email 已確認、已設密碼，且不需完成 MFA setup）
  - **登入後可存取至少一個需登入頁面**（不會被導去 `/tos` 或 `/mfa/setup`）
  - **ZAP spider 可成功爬入 authenticated route**（使用 ZAP authenticated context）

## 變更檔案清單（最小 diff，預計）

- 修改
  - `[docker-compose.gcp.yml](c:/dev/AITUBER/aituber-kit/docker-compose.gcp.yml)`
    - 移除 service `env_file: - .env`
    - 將所有網域/URL/redirect/origin hardcode 改為純 `${VAR}`
    - 保留 `./${CADDYFILE_NAME}` 與 `./supabase/${KONG_CONFIG_NAME}` 掛載參數化
  - `[.gitignore](c:/dev/AITUBER/aituber-kit/.gitignore)`：忽略 `.env.prod`、`.env.stg`
- 新增
  - `[Caddyfile.prod](c:/dev/AITUBER/aituber-kit/Caddyfile.prod)`
  - `[Caddyfile.stg](c:/dev/AITUBER/aituber-kit/Caddyfile.stg)`
  - `[supabase/kong.gcp.prod.yml](c:/dev/AITUBER/aituber-kit/supabase/kong.gcp.prod.yml)`（僅 CORS origins 不同）
  - `[supabase/kong.gcp.stg.yml](c:/dev/AITUBER/aituber-kit/supabase/kong.gcp.stg.yml)`（僅 CORS origins 不同）
  - `[.env.prod.example](c:/dev/AITUBER/aituber-kit/.env.prod.example)`
  - `[.env.stg.example](c:/dev/AITUBER/aituber-kit/.env.stg.example)`

## 實作時的 diff 重點（你關心的）

- **完全移除**所有 `:-https://ai-interview.tw` / `:-https://supabase.ai-interview.tw` fallback。
- `NEXT_PUBLIC_SUPABASE_URL` 等全部改為 `${VAR}`。
- stg Basic Auth 僅存在 `Caddyfile.stg` 並以 env `BASIC_AUTH_USER/BASIC_AUTH_PASS_HASH` 提供；prod 不受影響。
- Kong 兩份 config 除 origins 外完全一致（避免路由差異造成環境行為不一致）。

