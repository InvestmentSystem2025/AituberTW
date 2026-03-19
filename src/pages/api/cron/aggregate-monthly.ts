/**
 * POST /api/cron/aggregate-monthly
 *
 * Aggregates the previous month's token_usage_daily rows into
 * token_usage_monthly (with estimated_cost_twd).
 *
 * Idempotent: can be re-run for the same month — uses UPSERT via RPC.
 *
 * Invocation:
 *   - Vercel Cron: every 1st of the month at 00:00 Asia/Taipei (= 16:00 UTC prev day)
 *   - Manual: POST /api/cron/aggregate-monthly  (with CRON_SECRET header)
 *   - Override month: POST body { "month": "YYYY-MM" }
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { aggregateMonthlyData } from '@/lib/tokenUsageService'
import { serverCache } from '@/lib/serverCache'

const CRON_SECRET = process.env.CRON_SECRET as string | undefined

function isAuthorized(req: NextApiRequest): boolean {
  // x-vercel-cron header is NOT trusted — any client can spoof it.
  // All callers must present a valid Bearer token.
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'development') return true
    console.error('[Cron/aggregate-monthly] CRON_SECRET is not set — refusing request')
    return false
  }

  const auth = req.headers['authorization'] ?? ''
  return auth === `Bearer ${CRON_SECRET}`
}

function getPreviousMonthTaipei(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  now.setDate(1)
  now.setMonth(now.getMonth() - 1)
  return now.toLocaleDateString('sv-SE').substring(0, 7) // YYYY-MM
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  if (!isAuthorized(req)) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const bodyMonth =
    req.method === 'POST' && req.body?.month ? String(req.body.month) : undefined
  const targetMonth = bodyMonth ?? getPreviousMonthTaipei()

  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    return res.status(400).json({ error: 'INVALID_MONTH', detail: 'Expected YYYY-MM' })
  }

  const startedAt = Date.now()
  console.log(`[Cron/aggregate-monthly] START month=${targetMonth}`)

  try {
    await aggregateMonthlyData(targetMonth)

    // Invalidate server-side cache for this month's dashboard data
    serverCache.del(`dashboard:monthly:${targetMonth}`)

    const elapsed = Date.now() - startedAt
    console.log(
      `[Cron/aggregate-monthly] DONE month=${targetMonth} elapsed=${elapsed}ms`
    )

    return res.status(200).json({ ok: true, month: targetMonth, elapsed_ms: elapsed })
  } catch (err) {
    const elapsed = Date.now() - startedAt
    console.error(
      `[Cron/aggregate-monthly] FAILED month=${targetMonth} elapsed=${elapsed}ms`,
      err
    )
    return res.status(500).json({
      ok: false,
      month: targetMonth,
      error: err instanceof Error ? err.message : String(err),
      elapsed_ms: elapsed,
    })
  }
}
