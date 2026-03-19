# 面試 API 壓測（seed + k6）

此文件提供「一次性建立壓測帳號」與「k6 API-only 壓測」的**可照做流程**。

> 重要：`tmp/stress-accounts.json` 內含測試帳號密碼，請勿 commit（本 repo 已在 `.gitignore` 忽略）。

---

## 0) 前置條件

- 你要測的站點（本機或 staging）必須能連到同一個 Supabase（DB + Auth）。
- 你需要 1 個已存在的 `job_opening.id` 作為壓測的面試職缺。

---

## 要在 VM 跑還是本機跑？

- **測本機（localhost / 開發環境）**：建議直接在**本機**跑 seed + k6（因為你的 `BASE_URL` 通常是 `http://localhost:3000`）。
- **測 staging / 線上環境**：
  - **建議在 VM 跑 k6**（靠近 staging 所在區域/同 VPC 更好），可以減少家用網路波動、避免把「你本機到雲端的網路」誤當成系統瓶頸。
  - seed 只要跑一次，**VM 或本機都可以**；重點是能連到 `NEXT_PUBLIC_SUPABASE_URL` 與 `BASE_URL`（若 `BASE_URL` 有 Basic Auth，也要能帶 `BASIC_USER/BASIC_PASS`）。

---

## 1) 一次性 seed：建立壓測用 jobSeeker + interview

### 必要環境變數

- `NEXT_PUBLIC_SUPABASE_URL`（必填）
- `SUPABASE_SERVICE_ROLE_KEY`（必填）
- `JOB_OPENING_ID`（必填）
- `BASE_URL`（建議填；預設 `http://localhost:3000`）

### 若 `BASE_URL`（staging）有 Basic Auth

若你的 `BASE_URL`（例如 `stg.ai-interview.tw`）有 Basic Auth，seed 會在「抽樣驗證」那一步需要通過 Basic Auth。
請額外設定：

- `BASIC_USER` / `BASIC_PASS`（或使用既有的 `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`）

### 可選環境變數

- `STRESS_USER_COUNT`（預設 `50`）
- `STRESS_USER_PASSWORD`（預設 `StressP@ssw0rd!`）
- `STRESS_USER_EMAIL_PREFIX`（預設 `stress`）
- `STRESS_USER_EMAIL_DOMAIN`（預設 `example.com`）

### PowerShell 範例（本機）

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="http://localhost:8000"   # 依你的環境調整
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:JOB_OPENING_ID="00000000-0000-0000-0000-000000000000"
$env:BASE_URL="http://localhost:3000"

# 可選
$env:STRESS_USER_COUNT="50"

node ./scripts/seed-stress-users.mjs
```

成功後會產生 `tmp/stress-accounts.json`，格式如下：

- `[{ email, password, interview_id, user_id, profile_id }, ...]`

seed 會自動做「抽樣驗證」：

- 隨機挑 1 個帳號用 password grant 登入
- 用該 token 呼叫 `GET /api/interviews/get?interview_id=...` 必須回 200

---

## 2) k6 API-only 壓測：get + (每 VU 一次) start-session + save-session

### 必要環境變數

- `BASE_URL`：你的 Next.js 站點（本機 `http://localhost:3000` / staging 網域）
- `NEXT_PUBLIC_SUPABASE_URL`：同一套 Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：建議使用 anon key 做 password grant（不要用 service role）

### 建議做兩種測試（ramp + soak）

- **ramp（趨勢/冒煙）**：快速看 1→5→10→20→50 的趨勢（目前預設就是 ramp）
- **soak（穩定性）**：固定 50 VU 長跑 10～20 分鐘，抓長尾 p99、連線池、資源累積問題

soak 相關環境變數（可選）：

- `TEST_MODE=soak`
- `SOAK_VUS`（預設 50）
- `SOAK_DURATION`（預設 10m；可改 20m）

### （可選）讓 k6 也「直接參照 .env」

k6 本身不會自動讀 `.env`。你可以用 PowerShell 先把 `.env` 載入成目前 shell 的環境變數，再跑 k6：

```powershell
Get-Content .\.env | ForEach-Object {
  $line = $_.Trim()
  if (!$line -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $k = $line.Substring(0, $eq).Trim()
  $v = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
  if ($k) { Set-Item -Path "Env:$k" -Value $v }
}
```

> 上面會把 `.env` 的 key/value 寫到目前這個 PowerShell session；關掉視窗就會消失。

### PowerShell 範例（本機）

```powershell
k6 run `
  -e BASE_URL=http://localhost:3000 `
  -e NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000 `
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY `
  k6/interview-api-load.js
```

### PowerShell 範例（staging 有 Basic Auth 時）

若 staging 由 Caddy Basic Auth 保護（即使是 API 也擋），加上：

```powershell
k6 run `
  -e BASE_URL=https://stg.ai-interview.tw `
  -e BASIC_USER=stg `
  -e BASIC_PASS=YOUR_PASSWORD `
  -e NEXT_PUBLIC_SUPABASE_URL=https://YOUR_SUPABASE_URL `
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY `
  k6/interview-api-load.js
```

### PowerShell 範例（soak：固定 50VU 跑 10 分鐘）

```powershell
k6 run `
  -e TEST_MODE=soak `
  -e SOAK_VUS=50 `
  -e SOAK_DURATION=10m `
  --summary-export=tmp/k6-soak-summary.json `
  k6/interview-api-load.js | Tee-Object -FilePath tmp/k6-soak-run.log
```

### PowerShell 範例（soak：50 VU 跑 30 分鐘，看長時間穩定性）

使用專用腳本（輸出檔名會是 `tmp/k6-soak-50vu-30-YYYYMMDDHHmm.json`）：

```powershell
k6 run `
  -e BASE_URL=https://stg.ai-interview.tw `
  -e BASIC_USER=stg `
  -e BASIC_PASS=YOUR_PASSWORD `
  -e NEXT_PUBLIC_SUPABASE_URL=https://YOUR_SUPABASE_URL `
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY `
  k6/interview-api-soak-50vu-30m.js | Tee-Object -FilePath tmp/k6-soak-50vu-30m.log
```

---

## 4) 老闆常見要求：10VU 1h soak、50VU 30m soak、30/50VU spike

本 repo 已提供 4 個「可直接跑」的腳本（共用同一套 API 流程與報告輸出）：

- `k6/interview-api-soak-10vu-1h.js`：平均分散（約 10 人同時），跑 1 小時
- `k6/interview-api-soak-50vu-30m.js`：**50 VU、30 分鐘** soak，看長時間穩定性（p99 是否隨時間上升、記憶體/連線池累積等）
- `k6/interview-api-spike-30vu.js`：Spike（0→30VU 30 秒，維持 5 分鐘，再用 5 分鐘降回 0）
- `k6/interview-api-spike-50vu.js`：Spike（0→50VU 30 秒，維持 5 分鐘，再用 5 分鐘降回 0）

> 這些腳本會在結束時自動產生 `tmp/k6-soak-*vu-*.json` 或 `tmp/k6-ramp-*.json`（檔名含時間戳；內容已去除 token，可轉寄匯報）。報告內含**各端點**的 P95/P99（`latency.get`、`latency.start_session`、`latency.save_session` 各有一組 `p95_ms`、`p99_ms` 等），方便比對與存檔。

### k6 腳本固定規格（你會看到的行為）

- VU 綁定：`idx = (__VU - 1) % accounts.length`
- `setup()`：先替每個 account 做 password grant 拿 token（tag `name:auth`）
- `default()`：
  - 每個 VU **只呼叫一次** `POST /api/interviews/start-session`（tag `name:start-session`）
  - 每次 iteration 固定：
    - `GET /api/interviews/get`（tag `name:get`，HTTP 200 + 狀態不在禁止清單）
    - `POST /api/interviews/save-session`（tag `name:save-session`，HTTP 200 且 `body.ok === true`）
    - `sleep(1~3s)` 隨機

### 指標/Threshold

腳本只針對 `get|start-session|save-session` 設 thresholds；`auth` 不會污染這些指標。

### JSON 報告：各端點 P95 / P99

每次跑完會寫入的 JSON 報告（例如 `tmp/k6-soak-50vu-30-YYYYMMDDHHmm.json`）結構如下（節錄）：

- `latency.overall`：整體請求延遲
- `latency.get`、`latency.start_session`、`latency.save_session`：**各端點**一組，每組含 `avg_ms`、`p95_ms`、`p99_ms`、`max_ms`、`min_ms`、`med_ms`
- `error_rate.*`：各端點錯誤率
- `checks`：各 check 的 passes/fails
- `thresholds_breached`：觸發的 threshold

可直接把該 JSON 存檔或交給 CI/報表使用。

### 觀察「P99 是否隨時間慢慢上升」

單次 run 的總結只會給**整段測試一個** P99；若要看 30 分鐘內 P99 是否隨時間漂高，可選：

1. **k6 輸出每筆樣本**：`k6 run --out json=tmp/samples.json k6/interview-api-soak-50vu-30m.js`，再自行依時間視窗（例如每 5 分鐘）對 `tmp/samples.json` 做分桶、算各段 P95/P99。
2. **InfluxDB / Prometheus + Grafana**：k6 的 `--out influxdb` 或 `--out experimental-prometheus` 可把指標打進時序 DB，在 Grafana 看各時段的 P99 曲線。

---

## 2.5) 伺服器端負荷（CPU・記憶體・Load Average）

**k6 只會產出「客戶端」指標**（延遲、throughput、錯誤率、p95 等）。  
**被測 VM 上的 CPU 使用率、記憶體使用量、load average** 不會出現在 k6 的輸出或 `--summary-export` 裡，需要**在跑 k6 的同一時段、在被測的那台 VM 上**另外監控。

### 做法一：在被測 VM 上跑簡易統計腳本（推薦）

在 **staging 那台 VM（Linux）** 上，於 k6 開始前先啟動監控，k6 結束後停止，即可得到與 k6 時間軸對齊的伺服器負荷 log。

```bash
# 在 VM 上（例：staging 主機）
cd /path/to/aituber-kit
chmod +x scripts/vm-stats-during-load.sh
./scripts/vm-stats-during-load.sh 600 > tmp/vm-stats-soak.log 2>&1
# 600 = 取樣 600 秒（10 分鐘），依 SOAK_DURATION 調整
```

同一時間在**你本機或另一台機器**跑 k6 soak。結束後看 `tmp/vm-stats-soak.log`（每 10 秒一筆：時間、load average、記憶體、CPU%）。

### 做法二：GCP Console（若 staging 在 GCP）

1. 開啟 **Google Cloud Console** → **Compute Engine** → **VM 執行個體**
2. 點選你的 staging VM
3. 分頁 **「監控」** 可看 CPU 使用率、網路、磁碟
4. 在 k6 跑的那 10 分鐘區間看圖表，即可回答「當時 CPU / 記憶體是否異常」

記憶體若要在 Console 看更細，可考慮用 **Monitoring → Metrics Explorer** 查 `agent.googleapis.com/memory/percent_used`（需在 VM 安裝 Cloud Monitoring agent，非必須）。

### 做法三：手動下指令（快速確認用）

SSH 進被測 VM 後，在 k6 運行期間手動執行：

```bash
# 每 10 秒印一次 load + 記憶體
watch -n 10 'date; cat /proc/loadavg; free -m'
```

或用 `htop`、`top` 即時看。

### 回報給主管時可一併附上

- **客戶端**：k6 的 `tmp/k6-soak-summary.json` 或 log（p95、錯誤率、RPS）
- **伺服器端**：上述任一方式取得的 **同一時段** CPU、記憶體、load average（截圖或 `tmp/vm-stats-soak.log` 摘要）

---

## 3) 常見錯誤排查

### 401（UNAUTHORIZED）

- **現象**：API 回 `401 { error: 'UNAUTHORIZED' }`
- **原因**：JWT 沒帶/失效；或 staging Basic Auth 擋掉請求
- **檢查**
  - 確認 `tmp/stress-accounts.json` 是新產生的（token 會用帳密重新取）
  - staging 若有 Basic Auth，請加 `BASIC_USER/BASIC_PASS`

### 403（MFA_REQUIRED / SESSION_NOT_STARTED / FORBIDDEN）

- **MFA_REQUIRED**
  - seed 沒把 `profiles.mfa_totp_enabled_at` 設好，或 profiles trigger 尚未建完
  - 重新跑 seed（或檢查 seed log 是否在 profiles 等待階段 timeout）
- **SESSION_NOT_STARTED**
  - 沒先呼叫 `start-session` 就打 `save-session`
  - k6 腳本已用 per-VU flag 做一次性 `start-session`，若你改過腳本請對照回來
- **FORBIDDEN**
  - 帳號與 `interview_id` 不匹配（例如拿錯 json、或手動混用不同環境的檔案）

### 404（INTERVIEW_NOT_FOUND）

- **原因**：`interview_id` 不存在於該環境，或你測的 `BASE_URL` 指到不同 DB/不同 Supabase
- **檢查**：確認 `BASE_URL` 與 `NEXT_PUBLIC_SUPABASE_URL` 是同一套環境

