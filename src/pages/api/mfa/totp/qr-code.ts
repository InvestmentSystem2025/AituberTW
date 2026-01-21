import type { NextApiRequest, NextApiResponse } from 'next'
import QRCode from 'qrcode'
import { getAuthUserIdFromRequest } from '@/lib/supabaseServer'

type ErrResp = { error: string; message?: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse<Buffer | ErrResp>) {
  if (req.method !== 'GET') return res.status(405).end()

  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const otpauthUrl = req.query?.otpauth_url
  if (!otpauthUrl || typeof otpauthUrl !== 'string') {
    return res.status(400).json({ error: 'MISSING_OTPAUTH_URL' })
  }

  try {
    const png = await QRCode.toBuffer(otpauthUrl, {
      type: 'png',
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).send(png)
  } catch (e: any) {
    console.error('qr-code generation failed:', e)
    return res.status(500).json({ error: 'QR_GENERATION_FAILED', message: e?.message || 'QR_GENERATION_FAILED' })
  }
}


