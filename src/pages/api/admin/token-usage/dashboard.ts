/**
 * GET /api/admin/token-usage/dashboard
 *
 * Returns aggregated token usage data for the admin dashboard.
 *
 * Auth: x-admin-auth: Basic <base64(user:pass)>
 *
 * Cache strategy:
 *   - Monthly + trend data: server-side cache TTL 300s (in tokenUsageService)
 *   - Today breakdown: server-side cache TTL 60s
 *   - Today total: from Redis (real-time, no cache)
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { getDashboardData } from '@/lib/tokenUsageService'

const ADMIN_USERNAME = 'super123'
const ADMIN_PASSWORD = 'kapibarachiikawa'
const EXPECTED_TOKEN = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString('base64')

function isValidAdminRequest(req: NextApiRequest): boolean {
  const header = req.headers['x-admin-auth']
  if (!header || typeof header !== 'string') return false
  const token = header.startsWith('Basic ') ? header.slice(6).trim() : header
  return token === EXPECTED_TOKEN
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!isValidAdminRequest(req)) return res.status(401).json({ error: 'UNAUTHORIZED' })

  try {
    const data = await getDashboardData()
    // Allow CDN/browser to cache for 30s; server cache handles the heavy lifting
    res.setHeader('Cache-Control', 'private, max-age=30')
    return res.status(200).json(data)
  } catch (err) {
    console.error('[API] token-usage/dashboard error:', err)
    return res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
}
