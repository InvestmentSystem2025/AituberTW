import type { NextApiRequest, NextApiResponse } from 'next'
import { getAnonClient } from '@/lib/supabaseServer'

type Req = { email: string; password: string; role: 'jobSeeker' | 'recruiter'; nonce: string }
type Resp = { ok: true } | { error: string; code?: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email, password, role, nonce } = (req.body || {}) as Req
  if (!email || !password || !role || !nonce) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const supa = getAnonClient()

  // attach nonce and role to user metadata for post-claim auditing
  const { error } = await supa.auth.signUp({
    email,
    password,
    options: { data: { nonce, role } }
  })

  if (error) {
    // map some DB function errors if bubbled later
    return res.status(400).json({ error: error.message, code: error.message.includes('expired') ? 'TOS_EXPIRED' : undefined })
  }

  return res.status(200).json({ ok: true })
}



