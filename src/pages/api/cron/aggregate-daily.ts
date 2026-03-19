/**
 * POST /api/cron/aggregate-daily
 *
 * Aggregates the previous day's token_usage_logs into token_usage_daily,
 * then deletes the corresponding Redis daily counters.
 *
 * Idempotent: can be re-run for the same date — uses UPSERT via RPC.
 *
 * Invocation:
 *   - Vercel Cron: every day at 00:00 Asia/Taipei (= 16:00 UTC prev day)
 *   - Manual: POST /api/cron/aggregate-daily  (with CRON_SECRET header)
 *   - Override date: POST body { "date": "YYYY-MM-DD" }
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { aggregateDailyLogs } from '@/lib/tokenUsageService'
import { deleteDailyKeys } from '@/lib/redisClient'
import { serverCache } from '@/lib/serverCache'

const CRON_SECRET = process.env.CRON_SECRET as string | undefined

function isAuthorized(req: NextApiRequest): boolean {
  // x-vercel-cron header is NOT trusted because any client can spoof it.
  // All callers (including Vercel Cron and Docker cron container) must present
  // a valid Bearer token. CRON_SECRET is required in production.
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'development') return true
    console.error('[Cron/aggregate-daily] CRON_SECRET is not set — refusing request')
    return false
  }

  const auth = req.headers['authorization'] ?? ''
  return auth === `Bearer ${CRON_SECRET}`
}

function getPreviousDayTaipei(): string {
  const now = new Date()
  // Subtract 1 day from the current Taipei date
  const taipeiDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  taipeiDate.setDate(taipeiDate.getDate() - 1)
  return taipeiDate.toLocaleDateString('sv-SE') // YYYY-MM-DD
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (!isAuthorized(req)) return res.status(401).json({ error: 'UNAUTHORIZED' })

  // Allow manual override of target date for re-runs
  const bodyDate =
    req.method === 'POST' && req.body?.date ? String(req.body.date) : undefined
  const targetDate = bodyDate ?? getPreviousDayTaipei()

  // Basic date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return res.status(400).json({ error: 'INVALID_DATE', detail: 'Expected YYYY-MM-DD' })
  }

  const startedAt = Date.now()
  console.log(`[Cron/aggregate-daily] START date=${targetDate}`)

  try {
    // Step 1: Aggregate logs → token_usage_daily (idempotent UPSERT)
    const { rows, userIds } = await aggregateDailyLogs(targetDate)

    // Step 2: Remove Redis daily counters (cron cleanup; TTL 48h is the safety net)
    const yyyymmdd = targetDate.replace(/-/g, '')
    await deleteDailyKeys(yyyymmdd, userIds)

    // Step 3: Invalidate server-side cache.
    // Cache keys are built using the date when getDashboardData() is called (i.e. "today"
    // at dashboard load time), NOT targetDate. The cron runs on the day AFTER targetDate,
    // so we must invalidate using the run date (today = D+1).
    const runDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    const runMonth = runDate.substring(0, 7)
    serverCache.del(`dashboard:trend:${runDate}`)
    serverCache.del(`dashboard:today:breakdown:${runDate}`)
    serverCache.del(`dashboard:monthly:${runMonth}`)
    // Also clear the target date's own breakdown in case cron ran on the same day (re-run)
    serverCache.del(`dashboard:today:breakdown:${targetDate}`)

    const elapsed = Date.now() - startedAt
    console.log(
      `[Cron/aggregate-daily] DONE date=${targetDate} rows=${rows.length} elapsed=${elapsed}ms`
    )

    return res.status(200).json({
      ok: true,
      date: targetDate,
      aggregated_rows: rows.length,
      elapsed_ms: elapsed,
    })
  } catch (err) {
    const elapsed = Date.now() - startedAt
    console.error(`[Cron/aggregate-daily] FAILED date=${targetDate} elapsed=${elapsed}ms`, err)
    return res.status(500).json({
      ok: false,
      date: targetDate,
      error: err instanceof Error ? err.message : String(err),
      elapsed_ms: elapsed,
    })
  }
}
