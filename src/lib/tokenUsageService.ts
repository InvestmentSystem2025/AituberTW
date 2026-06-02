/**
 * Token Usage Service
 *
 * Architecture:
 *   Layer 1 – Real-time rate limiting: Redis INCRBY (atomic)
 *   Layer 2 – Persistent log: token_usage_logs (append-only INSERT)
 *   Layer 3 – Aggregation: token_usage_daily / token_usage_monthly (for dashboard)
 *
 * Key rules enforced here:
 *   - total_tokens = input_tokens + output_tokens (never trust external value)
 *   - request_id must be generated server-side (UUID v4) BEFORE the AI call
 *   - is_free determined by Redis INCRBY return value (race-condition safe)
 *   - DB INSERT retried up to MAX_DB_RETRIES times; failures go to dead-letter log
 *   - Dashboard reads only aggregation tables + Redis (never full-scan logs)
 */

import { getServiceClient } from '@/lib/supabaseServer'
import { incrTokenCounters, getDailyTotal } from '@/lib/redisClient'
import { serverCache } from '@/lib/serverCache'

// ── Billing constants ────────────────────────────────────────────────────────
const DAILY_FREE_QUOTA = 2_500_000        // 2.5M tokens / day (global pool)
const INPUT_PRICE_PER_MILLION = 0.40      // USD
const OUTPUT_PRICE_PER_MILLION = 1.60     // USD
const TWD_PER_USD = 32

// ── Retry / dead-letter config ───────────────────────────────────────────────
const MAX_DB_RETRIES = 3
const RETRY_DELAY_MS = 200

// ── Cache TTL ────────────────────────────────────────────────────────────────
const CACHE_TTL_REALTIME = 60      // seconds — dashboard current data
const CACHE_TTL_HISTORY = 300      // seconds — historical aggregations

// ── Helpers ──────────────────────────────────────────────────────────────────
function getTaipeiYYYYMMDD(date = new Date()): string {
  return date
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    .replace(/-/g, '')
}

function getTaipeiDateString(date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) // YYYY-MM-DD
}

function getTaipeiMonthString(date = new Date()): string {
  return getTaipeiDateString(date).substring(0, 7) // YYYY-MM
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function calcCostTwd(paidInput: number, paidOutput: number): number {
  const usd =
    (paidInput / 1_000_000) * INPUT_PRICE_PER_MILLION +
    (paidOutput / 1_000_000) * OUTPUT_PRICE_PER_MILLION
  return Math.round(usd * TWD_PER_USD * 10000) / 10000
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface RecordTokenUsageParams {
  requestId: string        // UUID v4 generated server-side BEFORE AI call
  userId: string | null
  inputTokens: number
  outputTokens: number
}

export interface DashboardData {
  monthly: {
    free_tokens: number
    paid_tokens: number
    paid_input_tokens: number
    paid_output_tokens: number
    estimated_cost_twd: number
  }
  daily: {
    free_tokens: number
    paid_tokens: number
    paid_input_tokens: number
    paid_output_tokens: number
    total_tokens: number     // from Redis (real-time total)
  }
  trend: Array<{ date: string; total_tokens: number }>
}

// ── Core: recordTokenUsage ───────────────────────────────────────────────────
/**
 * Record token usage for a completed AI request.
 *
 * Call this ONLY after the AI request has fully succeeded (server-side completion).
 * Do NOT call on error / timeout / client-disconnect-before-server-completion.
 *
 * Steps:
 *  1. Validate & compute total_tokens (input + output — never from external)
 *  2. Increment Redis counters (global + per-user)
 *  3. Determine is_free from Redis return value
 *  4. Insert into token_usage_logs with retry
 *  5. On persistent failure: log dead-letter entry
 */
export async function recordTokenUsage(params: RecordTokenUsageParams): Promise<void> {
  const { requestId, userId, inputTokens, outputTokens } = params

  if (!requestId) {
    console.error('[TokenUsage] recordTokenUsage called without requestId — skipped')
    return
  }

  // Step 1: Always compute total server-side
  const totalTokens = inputTokens + outputTokens
  const yyyymmdd = getTaipeiYYYYMMDD()

  // Step 2: Redis INCRBY (atomic) — get new global total
  let isFree = true
  const newGlobalTotal = await incrTokenCounters({ totalTokens, userId, yyyymmdd })

  // Step 3: is_free determined by Redis return value
  // If Redis unavailable (null), fall back to DB count for is_free determination
  if (newGlobalTotal !== null) {
    isFree = newGlobalTotal <= DAILY_FREE_QUOTA
  } else {
    isFree = await fallbackIsFreeCheck(totalTokens)
  }

  // Step 4: DB INSERT with retry
  const supa = getServiceClient()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      const { error } = await supa.from('token_usage_logs').insert({
        request_id: requestId,
        user_id: userId ?? null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        is_free: isFree,
      })

      if (!error) return  // success

      // request_id duplicate → idempotent — treat as success
      if (error.code === '23505') {
        console.warn(`[TokenUsage] Duplicate request_id ${requestId} — skipped`)
        return
      }

      lastError = new Error(error.message)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }

    if (attempt < MAX_DB_RETRIES) await sleep(RETRY_DELAY_MS * attempt)
  }

  // Step 5: Dead-letter log after exhausting retries
  console.error(
    `[TokenUsage][DeadLetter] INSERT failed after ${MAX_DB_RETRIES} attempts.`,
    {
      requestId,
      userId,
      inputTokens,
      outputTokens,
      totalTokens,
      isFree,
      error: lastError?.message,
    }
  )
  // TODO: Integrate with a proper dead-letter queue (e.g. write to a
  // token_usage_dead_letter table or publish to a message queue).
}

/**
 * Fallback is_free check when Redis is unavailable.
 * Queries today's total from token_usage_logs (expensive — only used without Redis).
 */
async function fallbackIsFreeCheck(newTokens: number): Promise<boolean> {
  try {
    const supa = getServiceClient()
    const today = getTaipeiDateString()
    const { data, error } = await supa
      .from('token_usage_logs')
      .select('total_tokens')
      .gte('created_at', `${today}T00:00:00+08:00`)
      .lt('created_at', `${today}T23:59:59+08:00`)

    if (error || !data) return true

    const currentTotal = data.reduce((sum, row) => sum + (row.total_tokens as number), 0)
    return currentTotal + newTokens <= DAILY_FREE_QUOTA
  } catch {
    return true // conservative default
  }
}

// ── Core: getDashboardData ───────────────────────────────────────────────────
/**
 * Fetch all data needed for the dashboard.
 *
 * Data sources:
 *   - monthly.*     → token_usage_daily (current month, exclude today; server cache TTL 300s)
 *   - daily.total   → Redis (real-time)
 *   - daily.breakdown → token_usage_logs for today (server cache TTL 60s)
 *   - trend         → token_usage_daily last 30 days (server cache TTL 300s)
 *
 * Never full-scans logs for historical data — reads from aggregation tables only.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [monthly, dailyBreakdown, trend, redisDailyTotal] = await Promise.all([
    getMonthlyAggregation(),
    getTodayBreakdown(),
    getTrendData(),
    getTodayTotalFromRedis(),
  ])

  const paid_tokens = monthly.paid_input_tokens + monthly.paid_output_tokens

  return {
    monthly: {
      free_tokens: monthly.free_tokens,
      paid_tokens,
      paid_input_tokens: monthly.paid_input_tokens,
      paid_output_tokens: monthly.paid_output_tokens,
      estimated_cost_twd: calcCostTwd(monthly.paid_input_tokens, monthly.paid_output_tokens),
    },
    daily: {
      free_tokens: dailyBreakdown.free_tokens,
      paid_tokens: dailyBreakdown.paid_input_tokens + dailyBreakdown.paid_output_tokens,
      paid_input_tokens: dailyBreakdown.paid_input_tokens,
      paid_output_tokens: dailyBreakdown.paid_output_tokens,
      // Redis real-time total for today; fallback to breakdown sum
      total_tokens:
        redisDailyTotal !== null
          ? redisDailyTotal
          : dailyBreakdown.free_tokens +
            dailyBreakdown.paid_input_tokens +
            dailyBreakdown.paid_output_tokens,
    },
    trend,
  }
}

// ── Private helpers for getDashboardData ──────────────────────────────────────
interface MonthlyAgg {
  free_tokens: number
  paid_input_tokens: number
  paid_output_tokens: number
}

async function getMonthlyAggregation(): Promise<MonthlyAgg> {
  const month = getTaipeiMonthString()
  const today = getTaipeiDateString()
  const cacheKey = `dashboard:monthly:${month}:${today}`

  // Compute next month's first day to use as exclusive upper bound
  const [yearStr, monStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const mon = parseInt(monStr, 10)
  const nextMonthDate = mon === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(mon + 1).padStart(2, '0')}-01`

  return serverCache.getOrSet<MonthlyAgg>(cacheKey, CACHE_TTL_HISTORY, async () => {
    const supa = getServiceClient()
    const { data, error } = await supa
      .from('token_usage_daily')
      .select('free_tokens, paid_input_tokens, paid_output_tokens')
      .is('user_id', null)   // global rows
      .gte('date', `${month}-01`)
      .lt('date', today)
      .lt('date', nextMonthDate)

    if (error) {
      console.error('[TokenUsage] getMonthlyAggregation error:', error)
      return { free_tokens: 0, paid_input_tokens: 0, paid_output_tokens: 0 }
    }

    const rows = data ?? []
    const free_tokens = rows.reduce((sum, row) => sum + Number(row.free_tokens), 0)
    const paid_input_tokens = rows.reduce((sum, row) => sum + Number(row.paid_input_tokens), 0)
    const paid_output_tokens = rows.reduce((sum, row) => sum + Number(row.paid_output_tokens), 0)

    return {
      free_tokens,
      paid_input_tokens,
      paid_output_tokens,
    }
  })
}

interface DailyBreakdown {
  free_tokens: number
  paid_input_tokens: number
  paid_output_tokens: number
}

async function getTodayBreakdown(): Promise<DailyBreakdown> {
  const today = getTaipeiDateString()
  const cacheKey = `dashboard:today:breakdown:${today}`

  return serverCache.getOrSet<DailyBreakdown>(cacheKey, CACHE_TTL_REALTIME, async () => {
    const supa = getServiceClient()

    // Query today's logs directly — per spec, current-day breakdown from logs
    // This is the ONLY place where logs table is read (not full-scan: uses created_at index)
    const { data, error } = await supa
      .from('token_usage_logs')
      .select('input_tokens, output_tokens, is_free')
      .gte('created_at', `${today}T00:00:00+08:00`)
      .lte('created_at', `${today}T23:59:59.999+08:00`)

    if (error) {
      console.error('[TokenUsage] getTodayBreakdown error:', error)
      return { free_tokens: 0, paid_input_tokens: 0, paid_output_tokens: 0 }
    }

    const result: DailyBreakdown = { free_tokens: 0, paid_input_tokens: 0, paid_output_tokens: 0 }
    for (const row of data ?? []) {
      if (row.is_free) {
        result.free_tokens += (row.input_tokens as number) + (row.output_tokens as number)
      } else {
        result.paid_input_tokens += row.input_tokens as number
        result.paid_output_tokens += row.output_tokens as number
      }
    }
    return result
  })
}

async function getTodayTotalFromRedis(): Promise<number | null> {
  const yyyymmdd = getTaipeiYYYYMMDD()
  return getDailyTotal(yyyymmdd)
}

async function getTrendData(): Promise<Array<{ date: string; total_tokens: number }>> {
  const today = getTaipeiDateString()
  const cacheKey = `dashboard:trend:${today}`

  return serverCache.getOrSet(cacheKey, CACHE_TTL_HISTORY, async () => {
    const supa = getServiceClient()

    // Get last 30 days from token_usage_daily (global pool only) — walks the date index
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
    const fromDate = thirtyDaysAgo.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

    const { data, error } = await supa
      .from('token_usage_daily')
      .select('date, total_tokens')
      .is('user_id', null)   // global rows
      .gte('date', fromDate)
      .order('date', { ascending: true })

    if (error) {
      console.error('[TokenUsage] getTrendData error:', error)
      return []
    }

    return (data ?? []).map((row) => ({
      date: row.date as string,
      total_tokens: Number(row.total_tokens),
    }))
  })
}

// ── Aggregation helpers (used by cron jobs) ───────────────────────────────────
export interface DailyAggResult {
  user_id: string | null
  free_tokens: number
  paid_input_tokens: number
  paid_output_tokens: number
  total_tokens: number
}

/**
 * Aggregate token_usage_logs for a specific date into token_usage_daily.
 * Idempotent: re-running produces the same result (uses UPSERT RPC).
 *
 * @param dateStr - YYYY-MM-DD in Asia/Taipei
 * @returns list of upserted rows and the distinct user_ids found
 */
export async function aggregateDailyLogs(dateStr: string): Promise<{
  rows: DailyAggResult[]
  userIds: string[]
}> {
  const supa = getServiceClient()

  const start = `${dateStr}T00:00:00+08:00`
  const end   = `${dateStr}T23:59:59.999+08:00`

  const { data, error } = await supa
    .from('token_usage_logs')
    .select('user_id, input_tokens, output_tokens, total_tokens, is_free')
    .gte('created_at', start)
    .lte('created_at', end)

  if (error) throw new Error(`aggregateDailyLogs query failed: ${error.message}`)

  // Build per-user-id + global aggregations in a single pass (O(n), no N+1)
  const userMap = new Map<string, DailyAggResult>()
  const globalAgg: DailyAggResult = {
    user_id: null,
    free_tokens: 0,
    paid_input_tokens: 0,
    paid_output_tokens: 0,
    total_tokens: 0,
  }

  for (const row of data ?? []) {
    const uid = (row.user_id as string | null) ?? null
    const inp = row.input_tokens as number
    const out = row.output_tokens as number
    const tot = row.total_tokens as number
    const free = row.is_free as boolean

    // Global accumulation
    if (free) globalAgg.free_tokens += tot
    else {
      globalAgg.paid_input_tokens += inp
      globalAgg.paid_output_tokens += out
    }
    globalAgg.total_tokens += tot

    // Per-user accumulation
    if (uid) {
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          user_id: uid,
          free_tokens: 0,
          paid_input_tokens: 0,
          paid_output_tokens: 0,
          total_tokens: 0,
        })
      }
      const u = userMap.get(uid)!
      if (free) u.free_tokens += tot
      else {
        u.paid_input_tokens += inp
        u.paid_output_tokens += out
      }
      u.total_tokens += tot
    }
  }

  const rows: DailyAggResult[] = [globalAgg, ...Array.from(userMap.values())]
  const userIds = Array.from(userMap.keys())

  // UPSERT each row via RPC (idempotent partial-index UPSERT)
  for (const row of rows) {
    const { error: rpcErr } = await supa.rpc('upsert_token_usage_daily', {
      p_date: dateStr,
      p_user_id: row.user_id,
      p_free_tokens: row.free_tokens,
      p_paid_input_tokens: row.paid_input_tokens,
      p_paid_output_tokens: row.paid_output_tokens,
      p_total_tokens: row.total_tokens,
    })

    if (rpcErr) {
      throw new Error(
        `upsert_token_usage_daily failed for user_id=${row.user_id}: ${rpcErr.message}`
      )
    }
  }

  return { rows, userIds }
}

/**
 * Aggregate token_usage_daily for a specific month into token_usage_monthly.
 * Idempotent: re-running produces the same result (uses UPSERT RPC).
 *
 * @param monthStr - YYYY-MM
 */
export async function aggregateMonthlyData(monthStr: string): Promise<void> {
  const supa = getServiceClient()

  // Compute next month's first day to use as exclusive upper bound (handles 28/29/30/31 day months)
  const [yearStr, monStr] = monthStr.split('-')
  const year = parseInt(yearStr, 10)
  const mon = parseInt(monStr, 10)
  const nextMonthDate = mon === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(mon + 1).padStart(2, '0')}-01`

  // Fetch all daily rows for this month (global + per-user) — single query, walks date index
  const { data, error } = await supa
    .from('token_usage_daily')
    .select('user_id, free_tokens, paid_input_tokens, paid_output_tokens, total_tokens')
    .gte('date', `${monthStr}-01`)
    .lt('date', nextMonthDate)

  if (error) throw new Error(`aggregateMonthlyData query failed: ${error.message}`)

  // Aggregate by user_id (null = global) in single pass
  const monthMap = new Map<string, DailyAggResult>()

  for (const row of data ?? []) {
    const uid = (row.user_id as string | null) ?? '__global__'
    if (!monthMap.has(uid)) {
      monthMap.set(uid, {
        user_id: uid === '__global__' ? null : uid,
        free_tokens: 0,
        paid_input_tokens: 0,
        paid_output_tokens: 0,
        total_tokens: 0,
      })
    }
    const m = monthMap.get(uid)!
    m.free_tokens += Number(row.free_tokens)
    m.paid_input_tokens += Number(row.paid_input_tokens)
    m.paid_output_tokens += Number(row.paid_output_tokens)
    m.total_tokens += Number(row.total_tokens)
  }

  for (const row of monthMap.values()) {
    const costTwd = calcCostTwd(row.paid_input_tokens, row.paid_output_tokens)

    const { error: rpcErr } = await supa.rpc('upsert_token_usage_monthly', {
      p_month: monthStr,
      p_user_id: row.user_id,
      p_free_tokens: row.free_tokens,
      p_paid_input_tokens: row.paid_input_tokens,
      p_paid_output_tokens: row.paid_output_tokens,
      p_total_tokens: row.total_tokens,
      p_estimated_cost_twd: costTwd,
    })

    if (rpcErr) {
      throw new Error(
        `upsert_token_usage_monthly failed for user_id=${row.user_id}: ${rpcErr.message}`
      )
    }
  }
}
