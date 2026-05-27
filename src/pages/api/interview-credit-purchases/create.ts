import type { NextApiRequest, NextApiResponse } from 'next'
import {
  mapAuthErrorToStatus,
  requireRecruiterCompanyMember,
} from '@/lib/billing/auth'
import {
  createMerchantOrderNo,
  getAppBaseUrl,
} from '@/lib/billing/orderNumbers'
import {
  createMpgTradeFields,
  getMpgConfig,
  getMpgGateway,
  validateMpgConfig,
} from '@/lib/newebpay/mpgClient'

type Resp =
  | {
      ok: true
      purchase_id: string
      merchant_order_no: string
      gateway_url: string
      form_fields: {
        MerchantID: string
        TradeInfo: string
        TradeSha: string
        Version: string
      }
      gatewayUrl: string
      merchantOrderNo: string
      fields: {
        MerchantID: string
        TradeInfo: string
        TradeSha: string
        Version: string
      }
    }
  | { ok: false; error: string; message?: string }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Resp>
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' })

  const companyId =
    typeof req.body?.company_id === 'string' ? req.body.company_id : ''
  const packageId =
    typeof req.body?.package_id === 'string' ? req.body.package_id : ''
  if (!companyId || !packageId)
    return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' })

  try {
    const ctx = await requireRecruiterCompanyMember(req, companyId)
    const config = getMpgConfig()
    const configError = validateMpgConfig(config)
    if (configError)
      return res.status(503).json({
        ok: false,
        error: 'NEWEBPAY_CONFIG_ERROR',
        message: configError,
      })

    const { data: pkg, error: pkgErr } = await ctx.supa
      .from('credit_packages')
      .select(
        'id, name, price_twd, interview_count, per_interview_token_cap, is_active'
      )
      .eq('id', packageId)
      .eq('is_active', true)
      .maybeSingle()
    if (pkgErr || !pkg)
      return res.status(404).json({ ok: false, error: 'PACKAGE_NOT_FOUND' })

    const merchantOrderNo = createMerchantOrderNo('CRD')
    const { data: purchase, error: insertErr } = await ctx.supa
      .from('one_time_purchases')
      .insert({
        company_id: companyId,
        recruiter_id: ctx.profile.id,
        package_id: packageId,
        merchant_order_no: merchantOrderNo,
        amount: (pkg as any).price_twd,
        interview_count: (pkg as any).interview_count,
        per_interview_token_cap: (pkg as any).per_interview_token_cap,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insertErr)
      return res
        .status(500)
        .json({ ok: false, error: 'CREATE_PURCHASE_FAILED' })

    const baseUrl = getAppBaseUrl(req)
    const fields = createMpgTradeFields(
      {
        merchantOrderNo,
        amount: Number((pkg as any).price_twd),
        itemDesc: 'AI面接官 面接追加回数',
        email: ctx.profile.email || undefined,
        returnUrl: `${baseUrl}/payment/result`,
        notifyUrl:
          process.env.NEWEBPAY_MPG_NOTIFY_URL ||
          `${baseUrl}/api/newebpay/mpg/notify`,
        clientBackUrl: `${baseUrl}/me?tab=subscription`,
      },
      config
    )
    const gatewayUrl = getMpgGateway(config.env)

    return res.status(200).json({
      ok: true,
      purchase_id: (purchase as any).id,
      merchant_order_no: merchantOrderNo,
      gateway_url: gatewayUrl,
      form_fields: fields,
      gatewayUrl,
      merchantOrderNo,
      fields,
    })
  } catch (error) {
    return res.status(mapAuthErrorToStatus(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'CREATE_FAILED',
    })
  }
}
