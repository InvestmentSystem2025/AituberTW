/**
 * @jest-environment node
 */
import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/newebpay/mpg/notify'

jest.mock('@/lib/supabaseServer', () => ({
  getServiceClient: jest.fn(),
}))

jest.mock('@/lib/newebpay/mpgClient', () => ({
  decryptMpgTradeInfo: jest.fn(),
  getMaskedMpgCard: jest.fn(() => '400022******1111'),
  getMpgConfig: jest.fn(() => ({
    merchantId: 'MS_TEST',
    hashKey: '12345678901234567890123456789012',
    hashIV: '1234567890123456',
    version: '2.3',
    env: 'test',
  })),
  validateMpgConfig: jest.fn(() => null),
  verifyTradeSha: jest.fn((_tradeInfo: string, tradeSha?: string) => tradeSha === 'valid-sha'),
}))

const { getServiceClient } = jest.requireMock('@/lib/supabaseServer')
const { decryptMpgTradeInfo } = jest.requireMock('@/lib/newebpay/mpgClient')

const payloads: Record<string, Record<string, unknown>> = {
  success: {
    Status: 'SUCCESS',
    Message: '授權成功',
    Result: {
      MerchantID: 'MS_TEST',
      MerchantOrderNo: 'CRD_TEST_001',
      Amt: '10',
      TradeNo: 'TRADE_SUCCESS_001',
      RespondCode: '00',
      PaymentType: 'CREDIT',
      Card6No: '400022',
      Card4No: '1111',
    },
  },
  failed: {
    Status: 'MPG03009',
    Message: '交易失敗',
    Result: {
      MerchantID: 'MS_TEST',
      MerchantOrderNo: 'CRD_TEST_001',
      Amt: '10',
      TradeNo: 'TRADE_FAILED_001',
      RespondCode: '05',
      PaymentType: 'CREDIT',
    },
  },
  amountMismatch: {
    Status: 'SUCCESS',
    Message: '授權成功',
    Result: {
      MerchantID: 'MS_TEST',
      MerchantOrderNo: 'CRD_TEST_001',
      Amt: '99',
      TradeNo: 'TRADE_AMOUNT_001',
      RespondCode: '00',
      PaymentType: 'CREDIT',
    },
  },
  merchantMismatch: {
    Status: 'SUCCESS',
    Message: '授權成功',
    Result: {
      MerchantID: 'MS_OTHER',
      MerchantOrderNo: 'CRD_TEST_001',
      Amt: '10',
      TradeNo: 'TRADE_MERCHANT_001',
      RespondCode: '00',
      PaymentType: 'CREDIT',
    },
  },
}

function buildSupaMock(options?: {
  existingEvent?: { id: string; status: string } | null
  purchase?: Record<string, unknown> | null
}) {
  const calls = {
    inserts: [] as Array<{ table: string; payload: unknown }>,
    upserts: [] as Array<{ table: string; payload: unknown; options: unknown }>,
    updates: [] as Array<{ table: string; payload: unknown }>,
    rpc: [] as Array<{ fn: string; args: unknown }>,
  }
  const existingEvent = options?.existingEvent ?? null
  const purchase =
    options?.purchase ??
    {
      id: 'purchase-1',
      company_id: 'company-1',
      amount: 10,
      interview_count: 10,
      status: 'pending',
    }

  const from = jest.fn((table: string) => {
    const state: { operation?: 'upsert' | 'update' } = {}
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      upsert: jest.fn((payload: unknown, optionsArg: unknown) => {
        state.operation = 'upsert'
        calls.upserts.push({ table, payload, options: optionsArg })
        return chain
      }),
      update: jest.fn((payload: unknown) => {
        state.operation = 'update'
        calls.updates.push({ table, payload })
        return chain
      }),
      insert: jest.fn(async (payload: unknown) => {
        calls.inserts.push({ table, payload })
        return { data: null, error: null }
      }),
      maybeSingle: jest.fn(async () => {
        if (table === 'newebpay_webhook_events' && !state.operation) {
          return { data: existingEvent, error: null }
        }
        if (table === 'one_time_purchases' && state.operation === 'update') {
          return { data: { id: 'purchase-1' }, error: null }
        }
        if (table === 'one_time_purchases') {
          return { data: purchase, error: null }
        }
        return { data: null, error: null }
      }),
      single: jest.fn(async () => {
        if (table === 'newebpay_webhook_events' && state.operation === 'upsert') {
          return { data: { id: 'event-1' }, error: null }
        }
        return { data: null, error: null }
      }),
    }
    return chain
  })

  const rpc = jest.fn(async (fn: string, args: unknown) => {
    calls.rpc.push({ fn, args })
    return { data: { ok: true }, error: null }
  })

  return { client: { from, rpc }, calls }
}

async function postNotify(tradeInfo: string, tradeSha = 'valid-sha') {
  const { req, res } = createMocks({
    method: 'POST',
    body: { TradeInfo: tradeInfo, TradeSha: tradeSha },
  })
  await handler(req as any, res as any)
  return { statusCode: res._getStatusCode(), body: JSON.parse(res._getData()) }
}

describe('/api/newebpay/mpg/notify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    decryptMpgTradeInfo.mockImplementation((tradeInfo: string) => payloads[tradeInfo])
  })

  it('marks a successful pending purchase paid and adds interview credits', async () => {
    const supa = buildSupaMock()
    getServiceClient.mockReturnValue(supa.client)

    const response = await postNotify('success')

    expect(response).toEqual({ statusCode: 200, body: { status: 'SUCCESS', message: 'OK' } })
    expect(supa.calls.rpc).toEqual([
      {
        fn: 'add_company_interview_credits',
        args: { p_company_id: 'company-1', p_credits: 10 },
      },
    ])
    expect(supa.calls.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'one_time_purchases',
          payload: expect.objectContaining({ status: 'paid', trade_no: 'TRADE_SUCCESS_001' }),
        }),
        expect.objectContaining({
          table: 'newebpay_webhook_events',
          payload: expect.objectContaining({ status: 'processed' }),
        }),
      ])
    )
  })

  it('ignores an already processed duplicate webhook before updating credits', async () => {
    const supa = buildSupaMock({ existingEvent: { id: 'event-1', status: 'processed' } })
    getServiceClient.mockReturnValue(supa.client)

    const response = await postNotify('success')

    expect(response).toEqual({
      statusCode: 200,
      body: { status: 'SUCCESS', message: 'DUPLICATE_IGNORED' },
    })
    expect(supa.calls.rpc).toEqual([])
    expect(supa.calls.upserts).toEqual([])
  })

  it('records a failed payment without adding credits', async () => {
    const supa = buildSupaMock()
    getServiceClient.mockReturnValue(supa.client)

    const response = await postNotify('failed')

    expect(response).toEqual({
      statusCode: 200,
      body: { status: 'SUCCESS', message: 'PAYMENT_FAILED_RECORDED' },
    })
    expect(supa.calls.rpc).toEqual([])
    expect(supa.calls.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'one_time_purchases',
          payload: expect.objectContaining({ status: 'failed', trade_no: 'TRADE_FAILED_001' }),
        }),
      ])
    )
  })

  it('records amount mismatch as a security alert without adding credits', async () => {
    const supa = buildSupaMock()
    getServiceClient.mockReturnValue(supa.client)

    const response = await postNotify('amountMismatch')

    expect(response).toEqual({
      statusCode: 200,
      body: { status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' },
    })
    expect(supa.calls.rpc).toEqual([])
    expect(supa.calls.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'newebpay_webhook_events',
          payload: expect.objectContaining({
            status: 'security_alert',
            error_message: 'MPG Amt mismatch',
          }),
        }),
      ])
    )
    expect(supa.calls.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'billing_alerts',
          payload: expect.objectContaining({
            type: 'security_alert',
            severity: 'critical',
            message: 'MPG Amt mismatch',
          }),
        }),
      ])
    )
  })

  it('records merchant mismatch as a security alert without adding credits', async () => {
    const supa = buildSupaMock()
    getServiceClient.mockReturnValue(supa.client)

    const response = await postNotify('merchantMismatch')

    expect(response).toEqual({
      statusCode: 200,
      body: { status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' },
    })
    expect(supa.calls.rpc).toEqual([])
    expect(supa.calls.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'newebpay_webhook_events',
          payload: expect.objectContaining({
            status: 'security_alert',
            error_message: 'MPG MerchantID mismatch',
          }),
        }),
      ])
    )
  })

  it('records invalid TradeSha as a security alert before decrypting', async () => {
    const supa = buildSupaMock()
    getServiceClient.mockReturnValue(supa.client)

    const response = await postNotify('success', 'invalid-sha')

    expect(response).toEqual({
      statusCode: 200,
      body: { status: 'SUCCESS', message: 'SECURITY_ALERT_RECORDED' },
    })
    expect(decryptMpgTradeInfo).not.toHaveBeenCalled()
    expect(supa.calls.rpc).toEqual([])
    expect(supa.calls.upserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'newebpay_webhook_events',
          payload: expect.objectContaining({
            status: 'security_alert',
            error_message: 'MPG TradeSha verification failed',
          }),
        }),
      ])
    )
    expect(supa.calls.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'billing_alerts',
          payload: expect.objectContaining({
            type: 'security_alert',
            severity: 'critical',
            message: 'MPG TradeSha verification failed',
          }),
        }),
      ])
    )
  })
})
