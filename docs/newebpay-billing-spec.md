# NewebPay Billing Spec

這份文件集中保存本專案「AI 面接官」NewebPay billing 規格，避免後續 Codex session 只依賴 chat context。實作金流、訂閱、一次性付款、webhook、權益、token 預算、STG callback / Basic Auth 設定前，必須先查閱本文件。

來源：

- 藍新信用卡定期定額手冊 NDNP-1.0.7
- 藍新線上交易・幕前支付手冊 NDNF-1.2.2
- 本專案既有 billing foundation 與 STG 設定

## 專案背景

- App：AI 面接官
- Framework：Next.js Pages Router
- DB：Supabase / PostgreSQL
- STG domain：`https://stg.ai-interview.tw`
- STG 有 Basic Auth，但 NewebPay callback path 必須 bypass
- 課金對象主要是 company
- 操作者主要是 recruiter
- 管理者是 billing admin / system admin

## Billing 模式

### A. 定期定額 subscription

- 使用 NewebPay 信用卡定期定額，API：NPA-B05
- 用於 company 月額訂閱
- 建立委託時導到 NewebPay 頁面輸入信用卡；我方網站不可收信用卡號或 CVV
- 初回契約時立即扣第一期
- 之後每期由 NewebPay 自動扣款
- 使用 CAU
- `PeriodTimes = NE`
- 每期付款成功：
  - `current_period_end` 延長 30 天
  - `monthly_token_used = 0`
  - `token_period_start = now`
  - `token_period_end = current_period_end`
- 每期付款失敗：
  - 不延長 `current_period_end`
  - 不 reset token
  - 若仍有有效期間且 token 未用完，仍可繼續使用
- 一時停止：
  - 使用停止，所以 token 不消費
  - `current_period_end` 與 `monthly_token_used` 保留
- 再開：
  - 使用剩餘期間與剩餘 token
- 解約：
  - 剩餘期間與 token 仍可用
  - `current_period_end` 到期或 token 用完任一條件達成，即停止 subscription 權益
- CAU `CARD_NOT_ALLOWED`：
  - 信用卡不可使用，需要引導重新契約
  - 若仍有剩餘期間與 token，仍可用到其中一個條件用完

### B. 單次購買 TOKEN 方案

- 使用 NewebPay MPG / NPA-F01
- 用於公司購買一次性 TOKEN 額度
- 預設測試方案：`2,000K tokens`，價格 `NT$10`
- 購買次數無限制
- 購買一次，公司可用 TOKEN `+n`
- 沒有日數限制，只有 TOKEN 使用量限制
- 每場面試仍必須有單場 token guard，避免單場 AI token 成本失控
- 付款成功後增加公司一次性購買 TOKEN 餘額
- 付款失敗不可增加 TOKEN
- 企業端購買頁必須顯示「當前可使用 TOKEN」與「依當前使用狀況推測還可進行 OO 次面試」

## 共通金流安全規則

1. `ReturnURL` 只做畫面顯示，不可更新訂單狀態或權益；可寫入 sanitized diagnostic capture，用於追查藍新付款頁參數錯誤，但不得視為付款依據。
2. `NotifyURL` 才是付款狀態依據。
3. 不保存完整信用卡號。
4. 不保存 CVV。
5. 只可保存遮罩卡號。
6. HashKey / HashIV / MerchantID 不可輸出到 log。
7. Webhook 必須 idempotent。
8. Duplicate webhook 不可重複延長期間、reset token、增加 TOKEN、建立重複 payment。
9. Security alert 不可更新權益。
10. 所有金流權益變更要 transaction 或 RPC 化。
11. Admin 寫入操作要寫 audit log。
12. Basic Auth bypass 只限 NewebPay callback path，不可放行整個 `/api`。

## Version 與加密規則

- Periodic / NPA-B05 `Version` 固定 `1.5`，不可從 env 讀。
- AlterStatus / NPA-B051 `Version` 固定 `1.0`。
- MPG / NPA-F01 `Version` 為 `2.3`，可用 `NEWEBPAY_MPG_VERSION=2.3`。
- 不要新增 `NEWEBPAY_PERIOD_VERSION`。
- 舊 `NEWEBPAY_VERSION=2.0` 只允許 legacy NT$1 test helper 使用，不能用於新 billing flow。
- 不要設定 `EncryptType=1`，因目前使用 AES/CBC/PKCS7，不是 AES/GCM。
- AES：
  - AES-256-CBC
  - PKCS7 padding
  - HashKey 32 bytes
  - HashIV 16 bytes
  - 內層參數先組成 URL query string 後加密
  - 輸出 hex string

## Periodic NPA-B05 建立委託

### Gateway

- 測試：`https://ccore.newebpay.com/MPG/period`
- 正式：`https://core.newebpay.com/MPG/period`
- 傳送方式：HTML Form POST

### 外層參數

- `MerchantID_`：商店代號，必填，String(15)
- `PostData_`：AES 加密後委託參數，必填

### PostData_ 內層參數

- `RespondType`：必填，固定 `JSON`
- `TimeStamp`：必填，Unix timestamp 秒數，`Math.floor(Date.now() / 1000)`
- `Version`：必填，固定 `1.5`
- `LangType`：非必填，`zh-Tw` 或 `en`，本專案預設 `zh-Tw`
- `MerOrderNo`：必填，我方委託訂單編號，同一商店不可重複，建議英數字或底線
- `ProdDesc`：必填，例：`AI面接官企業サブスクリプション`
- `PeriodAmt`：必填，每期金額，TWD 正整數，來源 `billing_plans.price_twd`
- `PeriodType`：必填，`D` / `W` / `M` / `Y`，本專案月額用 `M`
- `PeriodPoint`：必填，`PeriodType=M` 時通常為 `01` 到 `31`
- `PeriodStartType`：必填，本專案固定 `2`，契約當天先付第一期
- `PeriodTimes`：必填，本專案固定 `NE`
- `ReturnURL`：本專案必送，例：`https://stg.ai-interview.tw/payment/result`
- `NotifyURL`：本專案必送，例：`https://stg.ai-interview.tw/api/newebpay/period/notify`
- `BackURL`：可設 `/me?tab=subscription`
- `PayerEmail`：必填，recruiter email
- `EmailModify`：預設 `0`
- `PaymentInfo`：預設 `Y`
- `OrderInfo`：數位服務預設 `N`

### 回應與成功判斷

NewebPay 會回傳 `Period`，需 AES 解密。

解密後：

- `Status`
- `Message`
- `Result`

`Result` 主要欄位：

- `MerchantID`
- `MerchantOrderNo`
- `PeriodType`
- `AuthTimes`
- `DateArray`
- `PeriodAmt`
- `PeriodNo`
- `AuthTime`
- `TradeNo`
- `CardNo`
- `AuthCode`
- `RespondCode`
- `EscrowBank`
- `AuthBank`
- `PaymentMethod`

初回成功：

- `Status = SUCCESS`
- `RespondCode = 00`

初回成功處理：

- `subscriptions.status = active`
- `subscription_payments.status = paid`
- 保存 `PeriodNo` / `TradeNo` / masked `CardNo` / `AuthCode` / `RespondCode` / `AuthTime` / `DateArray`
- `current_period_end` 延長 30 天：
  - 若 `current_period_end` 為 null 或小於 now，設為 `now + 30 days`
  - 若 `current_period_end` 大於 now，設為 `current_period_end + 30 days`
- `monthly_token_limit = billing_plans.monthly_token_limit`
- `monthly_token_used = 0`
- `token_period_start = now`
- `token_period_end = current_period_end`
- webhook event `status = processed`
- 回 HTTP 200

初回失敗處理：

- `subscriptions.status = failed`
- `subscription_payments.status = failed`
- 不延長 `current_period_end`
- 不 reset token
- 保存 `Message` / `RespondCode` / raw payload
- 回 HTTP 200

## NPA-N050 每期授權通知

NewebPay 每期扣款完成後 POST 到：

- `/api/newebpay/period/notify`

回傳欄位：

- `Period`：AES 加密內容

解密後 `Result` 主要欄位：

- `RespondCode`
- `MerchantID`
- `MerchantOrderNo`
- `OrderNo`，格式可能是商店訂單編號加期數
- `TradeNo`
- `AuthDate`
- `TotalTimes`
- `AlreadyTimes`
- `AuthAmt`
- `AuthCode`
- `EscrowBank`
- `AuthBank`
- `NextAuthDate`
- `PeriodNo`

每期成功：

- `Status = SUCCESS`
- `RespondCode = 00`

每期成功處理：

- `subscription_payments.status = paid`
- `subscriptions.status = active`
- `failed_payment_count = 0`
- `current_period_end` 延長 30 天
- `monthly_token_used = 0`
- `token_period_start = now`
- `token_period_end = current_period_end`
- 若 schema 有欄位，更新 `next_billing_date = NextAuthDate`
- webhook event `status = processed`
- 回 HTTP 200

重要異常：

- 若本地 `subscriptions.status` 已是 `cancel_at_period_end` 或 `canceled`，但收到 NPA-N050 成功：
  - 不要直接改回 active
  - `subscription_payments.status` 可為 paid
  - `subscription_payments.alert_flag = inconsistent_state`
  - 建立 `billing_alerts.type = unexpected_payment_after_cancel` 或 `newebpay_inconsistent_state`
  - Admin dashboard 要能看到

每期失敗處理：

- `subscription_payments.status = failed`
- `subscriptions.status = past_due` 或 `payment_failed`
- `failed_payment_count += 1`
- 不延長 `current_period_end`
- 不 reset token
- 不 terminate
- 若 `current_period_end` 還沒到期且 token 未用完，仍可使用
- 若到期或 token 已用完，停止 subscription 權益
- 寄付款失敗 email

## NPA-B051 修改委託狀態

用途：

- 一時停止
- 再開
- 解約

Gateway：

- 測試：`https://ccore.newebpay.com/MPG/period/AlterStatus`
- 正式：`https://core.newebpay.com/MPG/period/AlterStatus`

外層參數：

- `MerchantID_`
- `PostData_`

PostData_ 內層：

- `RespondType = JSON`
- `Version = 1.0`
- `MerOrderNo`
- `PeriodNo`
- `AlterType`
  - `suspend`
  - `restart`
  - `terminate`
- `TimeStamp`

成功判斷：

- 解密後 `Status = SUCCESS`

一時停止成功：

- `subscriptions.status = suspended_by_user`
- 有料功能停止
- token 不消費
- `current_period_end` 保留
- `monthly_token_used` 保留

再開成功：

- `subscriptions.status = active`
- 功能恢復
- 使用剩餘期間與剩餘 token
- 若回傳 `NewNextTime`，更新 next billing date

解約成功：

- `subscriptions.status = cancel_at_period_end`
- `cancel_at_period_end = true`
- `canceled_at = now`
- 不再續扣
- `current_period_end` 前且 token 未用完仍可使用
- 不刪除 AI 面接官資料、面試紀錄、公司設定、payment、subscription 歷史

若已因 CAU 或其他原因 terminate：

- 目的已達成時可視為實質成功
- 需記錄 response / reason
- 不要無限 retry

## CAU

CAU Notify URL：

- `/api/newebpay/cau/notify`

注意：

- CAU Notify URL 通常在 NewebPay 後台固定設定，不是 NPA-B05 動態傳入。

主要欄位：

- `Message`
- `Result.MerchantID`
- `Result.MerchantOrderNo`
- `Result.remainingTimes`
- `Result.AuthAmt`
- `Result.NextAuthDate`
- `Result.scheduleDates`
- `Result.PeriodNo`
- `Result.AlterType`
- `Result.cardStatus`
  - `ACTIVE`
  - `CARD_NOT_ALLOWED`
- `Result.newExpiry`

CAU `ACTIVE`：

- `card_status = active`
- `card_expiry = newExpiry`
- `next_billing_date = NextAuthDate`
- 更新 `remainingTimes` / `scheduleDates` 若有欄位
- 不延長 `current_period_end`
- 不 reset token
- subscription status 原則維持 active

CAU `CARD_NOT_ALLOWED`：

- 不 restart 舊委託
- `subscriptions.status = card_update_required`
- `card_status = card_not_allowed`
- `payment_method_required_at = now`
- 若 `current_period_end` 未到期且 token 未用完，仍可用
- 引導重新契約，建立新的 NPA-B05
- 舊 subscription 保留歷史

## MPG / NPA-F01 一次性付款

### Gateway

- 測試：`https://ccore.newebpay.com/MPG/mpg_gateway`
- 正式：`https://core.newebpay.com/MPG/mpg_gateway`
- 傳送方式：HTML Form POST

### 外層參數

- `MerchantID`
- `TradeInfo`
- `TradeSha`
- `Version = 2.3`

### TradeInfo 內層主要參數

- `MerchantID`
- `RespondType = JSON`
- `TimeStamp`
- `Version = 2.3`
- `MerchantOrderNo`
- `Amt`
- `ItemDesc`，例：`AI面接官 TOKEN方案 2000K`
- `OrderDetail`：信用卡單次購買不送；STG 曾因一般文字格式觸發 `MPG01028`
  訂單細項格式錯誤。若未來啟用需要細項的支付方式，須依藍新該支付方式規格送
  JSON / itemized 格式，且總額需等於 `Amt`。
- `NotifyURL`，STG：`https://stg.ai-interview.tw/api/newebpay/mpg/notify`
- `ReturnURL`，STG：`https://stg.ai-interview.tw/payment/result`
- `ClientBackURL`，可設 `/me?tab=subscription`
- `Email`
- `CREDIT = 1`
- `LoginType = 0`

### TradeSha

格式：

```text
HashKey={HashKey}&{TradeInfo}&HashIV={HashIV}
```

- SHA256
- uppercase hex

### MPG notify 驗證

成功驗證必須全部通過：

1. `MerchantID` 符合我方商店。
2. `TradeSha` / `CheckCode` 驗證通過。
3. `MerchantOrderNo` 存在。
4. `one_time_purchases.status = pending`。
5. `Amt` 等於 `one_time_purchases.amount` snapshot，不可 webhook 來時查目前 package price。
6. `Status = SUCCESS`。
7. `RespondCode = 00`。
8. `PaymentType = CREDIT`。
9. `TradeNo` 未處理過。
10. 只保存 `Card6No + ****** + Card4No` 類遮罩資料，不保存完整卡號。

成功處理：

- `one_time_purchases.status = paid`
- payment / purchase record 記錄 paid
- 公司一次性購買 TOKEN 餘額 `+= one_time_purchases.token_amount`
- webhook event `status = processed`
- 回 HTTP 200

失敗處理：

- `one_time_purchases.status = failed`
- 不增加 TOKEN
- 保存 `Message` / `RespondCode` / raw payload
- 回 HTTP 200

Security mismatch：

- 例如 `Amt` mismatch、`MerchantID` 不符、`TradeSha` 錯
- webhook event `status = security_alert`
- 建立 `billing_alerts`
- 不增加 TOKEN
- 不更新 payment 為 paid
- 不 reset token
- 目前可回 HTTP 200，避免無限 retry 噪音

## Webhook idempotency

所有 webhook 都必須先寫 `newebpay_webhook_events`，再做業務更新。

流程：

1. 收到 webhook。
2. 保存 raw payload。
3. 解密 / 驗證。
4. 判斷 event type。
5. 產生 `unique_key`。
6. 查 `unique_key` 是否已 processed。
7. 若已 processed，回 HTTP 200 並不重複處理。
8. 若未處理，insert received。
9. 使用 transaction / RPC 更新 subscription / payment / TOKEN wallet / token usage。
10. event status 設為 processed。
11. 若 retryable error，event status 設為 failed 並回 HTTP 500。
12. 若 security error，event status 設為 security_alert，建立 billing alert，不更新權益。

建議 unique key：

- initial auth：
  - `newebpay:initial_auth:{PeriodNo}:{TradeNo}`
  - fallback：`newebpay:initial_auth:{MerchantOrderNo}:{PeriodNo}`
- period auth：
  - `newebpay:period_auth:{PeriodNo}:{OrderNo}:{TradeNo}`
  - fallback：`newebpay:period_auth:{PeriodNo}:{OrderNo}:{AlreadyTimes}:{RespondCode}`
- CAU：
  - `newebpay:cau:{PeriodNo}:{cardStatus}:{newExpiry}:{NextAuthDate}`
- MPG one-time purchase：
  - `newebpay:mpg_one_time_purchase:{MerchantOrderNo}:{TradeNo}`
  - fallback：`newebpay:mpg_one_time_purchase:{MerchantOrderNo}:{Amt}:{Status}:{RespondCode}`

Security alert 條件：

- 解密失敗
- MerchantID 不符
- Amt mismatch
- TradeSha / CheckCode 驗證失敗
- PeriodNo / MerchantOrderNo 對不上
- payload 格式不符合
- duplicate 以外的 TradeNo 衝突

## Entitlement / token 規則

- `usable_days_remaining` 不存 DB。
- DB canonical source：
  - `subscriptions.current_period_end`
  - `admin_billing_entitlements.ends_at`
- `entitlement_end = max(subscription.current_period_end, active_admin_billing_entitlement.ends_at)`
- API response時計算 `usable_days_remaining = max(0, entitlement_end - now)`

Subscription 可用 status：

- `active`
- `past_due`
- `payment_failed`
- `cancel_at_period_end`
- `card_update_required`

不可用 status：

- `suspended_by_user`
- `suspended_by_admin`
- `admin_revoked`
- `failed`
- `canceled`
- `expired`

`manual_granted`：

- 只允許 legacy / migrated 相容。
- 新的 Admin grant 不可寫 `subscriptions.status = manual_granted`。
- 新的 Admin grant 必須寫 `admin_billing_entitlements`。

Subscription 可用條件：

- status 在可用清單內
- `entitlement_end > now`
- `monthly_token_used + estimated_tokens <= monthly_token_limit`

Admin entitlement：

- 存在 active `admin_billing_entitlements`
- `starts_at <= now`
- `ends_at > now`
- `monthly_token_limit_override > 0`
- 若 Admin grant 未指定 token limit，應從 plan `monthly_token_limit` 繼承

Token reserve / finalize：

- request 前 reserve estimated tokens
- AI 成功後 finalize actual input / output / total
- estimated > actual 時返還差額
- actual > estimated 時補扣差額
- 如果補扣後超過 limit，該場面試必須進入「token 用完」結束流程，不可繼續下一輪問答
- AI request error / timeout 且沒有 provider usage 時 release
- streaming 若 server `onFinish` 拿到 usage，即使 client 中斷也 finalize

Token route：

- subscription / admin entitlement 走 `reserve_company_billing_tokens`
- 一次性購買 TOKEN 走公司 TOKEN wallet reserve / finalize / release
- free quota 若仍保留免費面試額度，走 `reserve_interview_allocation_tokens` 或等價的免費額度 token guard
- 單次購買 TOKEN 不再用 `purchased_credit` 作為「面試次數」來源，不再於建立面試時扣 1 次 credit

Token 用完時的面試行為：

- 若單場 `token_cap` 超過，必須先保存當前 transcript / progress / token usage / session 狀態，然後結束面試。
- 若企業端 subscription / admin entitlement / 一次性購買 TOKEN 餘額不足或用完，必須先保存當前資料，然後結束面試。
- 結束後不應再讓應徵者繼續送出新回答或觸發下一輪 AI request。
- 面試結果狀態與畫面文案需標記為「因 TOKEN 額度不足而提前結束」，避免誤判為正常完成。

面試 token 需求預估：

- 招募方建立面試前，系統要判定「這次面試是否有足夠 TOKEN 完整執行」。
- 判定基準：`當前可使用 TOKEN > 過去面試 TOKEN 最大使用量`。
- 過去最大使用量以該公司既有面試的 `tokens_input + tokens_output` 最大值為基準。
- 若公司尚無歷史面試資料，使用系統預設估算值或方案預設值作為建立前檢查基準。
- 若不滿足條件，不允許建立面試，UI 必須顯示無法建立原因，並導向付費頁面。

## 面試建立流程

建立面試判斷順序：

1. free quota
2. subscription entitlement
3. 一次性購買 TOKEN 餘額
4. billing required

建立面試前 token 檢查：

- 招募方建立面試前，除了次數 / entitlement 判定外，還要檢查該場面試可用 token 是否足以完成一場面試。
- 可用 token 必須大於公司過去面試的最大 token 使用量。
- 若可用 token 不足，API 回傳明確錯誤碼，前端顯示原因並導向 `/me?tab=subscription` 或對應課金頁。

free quota：

- 使用既有 `company_interview_quota`
- 成功建立面試後寫 `interview_billing_allocations`
- `source = free_quota`
- `token_cap = billing_runtime_settings.free_interview_token_cap`
- 使用 free quota 時，只消耗免費配額與該場免費 token guard，不得扣除公司一次性購買的付費 TOKEN wallet。

subscription：

- 若 subscription / admin entitlement 可用，建立面試
- 寫 `interview_billing_allocations`
- `source = subscription`
- `subscription_id` 若來自 subscription
- AI 使用時走 `reserve_company_billing_tokens`

一次性購買 TOKEN：

- 公司一次性購買 TOKEN 餘額 > 公司過去面試 TOKEN 最大使用量時，允許建立面試。
- 建立面試時不扣 1 次 credit，也不預先扣完整面試 TOKEN。
- 面試進行中依 AI request reserve / finalize 實際消耗 TOKEN。
- 寫 `interview_billing_allocations` 或等價 allocation 記錄，用於標記該面試使用一次性購買 TOKEN wallet。
- `source = purchased_token` 或等價新值；不再使用 `purchased_credit` 表示面試次數。
- 若要追蹤單筆購買來源，應由 TOKEN wallet ledger 記錄消耗來源；不可依賴舊 `one_time_purchase_id` + `credits_used` 模型。

如果以上都不可用：

- 回 `BILLING_REQUIRED`
- UI 提示 subscription 或單次購買 TOKEN

應徵者面試開始前提示文：

- 面試開始前必須提示應徵者：
  - `請每題盡量以 1～2 分鐘回答。若回答時間過長，可能因 TOKEN 額度不足而提前結束面試。`

企業端 TOKEN 方案購買頁文案：

- 企業購買 TOKEN 方案區塊必須顯示：
  - `2,000K TOKEN 方案，NT$10。若每場面試約使用 100K TOKEN，約可進行 20 場面試（問題數目安：10 題）。`
- 訂閱 / TOKEN 頁面不可再以「剩餘建立面試次數」作為主要指標，必須改為：
  - `當前可使用 TOKEN：OOO TOKEN`
  - `依當前使用狀況推測還可進行 OO 次面試`

## Admin billing

Admin billing API 不可使用 hardcoded Basic Auth。必須使用 `app_admins`。

驗證規則：

1. 必須有 Supabase session token。
2. 由 token 找 profile。
3. 優先用 `profile_id` 查 `app_admins`。
4. email fallback 可用，但要 lower-case normalize。
5. `is_active = true`。
6. role in `billing_admin` / `system_admin`。

所有 admin billing 寫入操作：

- 必須寫 `admin_billing_audit_logs`
- `reason` 必填

Admin grant entitlement：

- 寫 `admin_billing_entitlements`
- 不建立 fake paid payment
- 不修改 NewebPay subscription
- `monthly_token_limit_override` 必填或從 plan `monthly_token_limit` 繼承

Admin revoke entitlement：

- revoke `admin_billing_entitlements`
- 不 terminate NewebPay subscription

Admin reset token：

- 對 subscription 或 admin entitlement 清 `monthly_token_used`
- 寫 audit

Admin update token limit：

- 更新 subscription override 或 admin entitlement override
- `used > limit` 時不刪 usage，下次使用阻擋
- 寫 audit

Admin update TOKEN wallet：

- atomic update
- 不可小於 0
- 寫 audit

Admin operate subscription：

- suspend / restart / cancel 若要操作 NewebPay，走 NPA-B051
- NewebPay response 必須檢查 `Status = SUCCESS`
- 失敗不能假裝成功
- 已 terminate 且目的已達成可視為實質成功，但要記錄 reason

## STG / Basic Auth / Caddy

STG domain：

- `https://stg.ai-interview.tw`

STG Basic Auth bypass path：

- `/api/newebpay/period/notify`
- `/api/newebpay/mpg/notify`
- `/api/newebpay/cau/notify`
- `/payment/result`
- `/payment/result/`

其他 `/api`、`/me`、`/admin` 仍應被 Basic Auth 保護。

Caddyfile.stg 概念：

```caddyfile
@newebpayCallback path /api/newebpay/period/notify /api/newebpay/mpg/notify /api/newebpay/cau/notify /payment/result /payment/result/

handle @newebpayCallback {
  reverse_proxy app:3000
}

handle {
  basicauth {
    {env.BASIC_AUTH_USER} {env.BASIC_AUTH_PASS_HASH}
  }
  reverse_proxy app:3000
}
```

`reverse_proxy app:3000` 是 Docker 內部 service `app` 的 port，不是外部 port。

docker compose STG 必須確認實際使用 `Caddyfile.stg`，例如 `.env` 內 `CADDYFILE_NAME=Caddyfile.stg`。

STG curl 驗證：

```bash
curl -i https://stg.ai-interview.tw/me

curl -i -X POST \
  https://stg.ai-interview.tw/api/newebpay/period/notify

curl -i -X POST \
  https://stg.ai-interview.tw/api/newebpay/mpg/notify \
  -H "Content-Type: application/json" \
  -d '{"TradeInfo":"bad","TradeSha":"bad"}'

curl -i -X POST \
  https://stg.ai-interview.tw/api/newebpay/cau/notify

curl -i \
  https://stg.ai-interview.tw/payment/result
```

預期：

- `/me` 是 Basic Auth 401
- callback path 不是 Basic Auth 401，可是 400 / security_alert
- `/payment/result` 不是 Basic Auth 401

## DB objects

Billing foundation tables:

- `billing_plans`
- `subscriptions`
- `admin_billing_entitlements`
- `subscription_payments`
- `token_packages` 或將既有 `credit_packages` migration 改為 TOKEN package schema
- `company_token_balance` 或等價公司 TOKEN wallet table
- `one_time_purchases`
- `interview_billing_allocations`
- `company_ai_token_usage_logs`
- `newebpay_webhook_events`
- `billing_alerts`
- `admin_billing_audit_logs`
- `billing_runtime_settings`
- `app_admins`

Token RPC:

- `reserve_company_billing_tokens`
- `finalize_company_billing_tokens`
- `release_company_billing_tokens`
- 一次性購買 TOKEN wallet 的 reserve / finalize / release RPC，或將其整合進 `reserve_company_billing_tokens`
- `reserve_interview_allocation_tokens`
- `finalize_interview_allocation_tokens`
- `release_interview_allocation_tokens`

TOKEN wallet RPC:

- `add_company_purchased_tokens` 或等價 RPC
- 舊 `add_company_interview_credits` 不可再作為新單次購買 TOKEN 方案的入帳方法

## 實作優先順序

1. DB / init.sql / migration 驗證。
2. Webhook fake test。
3. 接面試建立流程。
4. 接 AI token reserve / finalize / release。
5. Email notification。
6. Recruiter UI。
7. Admin UI。

不要先做 UI；先確保 webhook、entitlement、allocation、token budget 正確。

## Fake webhook 測試工具

專案提供 STG / local webhook 驗證腳本：

```bash
npm run newebpay:fake-webhook -- --help
```

或直接執行：

```bash
node scripts/newebpay-fake-webhook.mjs --help
```

支援 cases：

- `period-initial-success`
- `period-initial-failure`
- `period-auth-success`
- `period-auth-failure`
- `cau-active`
- `cau-card-not-allowed`
- `mpg-success`
- `mpg-failure`
- `mpg-security-alert`

注意事項：

- 腳本會讀取 NewebPay env，但不會輸出 MerchantID / HashKey / HashIV。
- success / failure case 需要 DB 內已有對應 pending subscription 或 pending one-time purchase，否則 webhook 會被視為 security alert。
- `--repeat 2` 可用來測 duplicate webhook idempotency。
- STG 預設 base URL 是 `https://stg.ai-interview.tw`。
- Windows `cmd.exe` 多行指令請用 `^` 續行，不要使用 Linux `\`。
