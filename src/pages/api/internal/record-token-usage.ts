/**
 * POST /api/internal/record-token-usage
 *
 * Internal Node.js API route called by the Edge AI routes (vercel.ts /
 * vercelAiRoute.ts) via fire-and-forget fetch once streaming completes.
 *
 * Purpose: Edge runtime cannot import ioredis (Node.js module), so token
 * recording must be delegated to a Node.js route. The caller fires this
 * without awaiting, so client disconnect does NOT prevent recording.
 *
 * Auth: X-Internal-Secret header must match CRON_SECRET env var.
 *   (We reuse CRON_SECRET to avoid adding another env var.)
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { recordTokenUsage } from '@/lib/tokenUsageService'

const INTERNAL_SECRET = process.env.CRON_SECRET as string | undefined

function isAuthorized(req: NextApiRequest): boolean {
  if (!INTERNAL_SECRET) {
    if (process.env.NODE_ENV === 'development') return true
    console.error('[Internal/record-token-usage] CRON_SECRET not set — refusing')
    return false
  }
  const secret = req.headers['x-internal-secret']
  return secret === INTERNAL_SECRET
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!isAuthorized(req)) return res.status(401).end()

  const { requestId, userId, inputTokens, outputTokens } = req.body ?? {}

  if (
    typeof requestId !== 'string' ||
    typeof inputTokens !== 'number' ||
    typeof outputTokens !== 'number'
  ) {
    return res.status(400).json({ error: 'INVALID_PARAMS' })
  }

  // Write FIRST, then respond.
  //
  // Rationale: In serverless / container environments the execution context
  // can be frozen or reclaimed immediately after res.end(). If we responded
  // first and then awaited recordTokenUsage(), the await might never complete,
  // silently dropping the write.
  //
  // The caller (Edge route) already fires this fetch without awaiting the
  // response, so making it synchronous here does NOT block the Edge route.
  await recordTokenUsage({
    requestId,
    userId: typeof userId === 'string' ? userId : null,
    inputTokens: Math.max(0, Math.floor(inputTokens)),
    outputTokens: Math.max(0, Math.floor(outputTokens)),
  })

  return res.status(200).end()
}
