/**
 * @jest-environment node
 */
import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/interviews/create'

jest.mock('@/lib/supabaseServer', () => ({
  getAuthUserIdFromRequest: jest.fn(),
  getServiceClient: jest.fn(),
}))

jest.mock('@/lib/interviewNotifications', () => ({
  sendInterviewCreationEmail: jest.fn().mockResolvedValue(undefined),
}))

const { getAuthUserIdFromRequest, getServiceClient } = jest.requireMock('@/lib/supabaseServer')

function buildSupaMock(options?: {
  member?: boolean
  profileExists?: boolean
  rpcError?: string | null
}) {
  const member = options?.member ?? true
  const profileExists = options?.profileExists ?? true
  const rpcError = options?.rpcError ?? null

  const from = jest.fn((table: string) => {
    const state: Record<string, any> = {}
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn((k: string, v: any) => {
        state[k] = v
        return chain
      }),
      maybeSingle: jest.fn(async () => {
        if (table === 'company_members') return { data: member ? { profile_id: 'me-profile' } : null }
        if (table === 'profiles' && state['id']) return { data: profileExists ? { id: state['id'] } : null }
        return { data: null }
      }),
      single: jest.fn(async () => {
        if (table === 'profiles' && state['auth_id']) return { data: { id: 'me-profile' } }
        return { data: null }
      }),
    }
    return chain
  })

  const rpc = jest.fn(async () => {
    if (rpcError) return { data: null, error: { message: rpcError } }
    return { data: { id: 'iv-1', company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z' }, error: null }
  })

  return { from, rpc }
}

describe('/api/interviews/create', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getAuthUserIdFromRequest.mockResolvedValue('auth-user-1')
  })

  it('rejects non-company-member access', async () => {
    getServiceClient.mockReturnValue(buildSupaMock({ member: false }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(403)
    expect(JSON.parse(res._getData())).toEqual({ error: 'FORBIDDEN' })
  })

  it('rejects when capacity reached', async () => {
    getServiceClient.mockReturnValue(buildSupaMock({ rpcError: 'CAPACITY_REACHED' }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData())).toEqual({ error: 'CAPACITY_REACHED' })
  })

  it('rejects on 4th interview quota attempt', async () => {
    getServiceClient.mockReturnValue(buildSupaMock({ rpcError: 'INTERVIEW_QUOTA_EXCEEDED' }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData())).toEqual({ error: 'INTERVIEW_QUOTA_EXCEEDED' })
  })

  it('returns billing required when no free quota or paid entitlement is available', async () => {
    getServiceClient.mockReturnValue(buildSupaMock({ rpcError: 'BILLING_REQUIRED' }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(402)
    expect(JSON.parse(res._getData())).toEqual({ error: 'BILLING_REQUIRED' })
  })

  it('returns billing required when available tokens are insufficient', async () => {
    getServiceClient.mockReturnValue(buildSupaMock({ rpcError: 'INSUFFICIENT_TOKENS_FOR_INTERVIEW' }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(402)
    expect(JSON.parse(res._getData())).toEqual({ error: 'INSUFFICIENT_TOKENS_FOR_INTERVIEW' })
  })

  it('returns a conflict when paid credit balance has no purchase snapshot ledger', async () => {
    getServiceClient.mockReturnValue(buildSupaMock({ rpcError: 'PURCHASED_CREDIT_LEDGER_MISMATCH' }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(409)
    expect(JSON.parse(res._getData())).toEqual({ error: 'PURCHASED_CREDIT_LEDGER_MISMATCH' })
  })

  it('rejects non-jobSeeker candidate by id/email check in rpc', async () => {
    getServiceClient.mockReturnValue(buildSupaMock({ rpcError: 'CANDIDATE_NOT_JOBSEEKER' }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', start_time: '2026-03-24T10:00:00Z', profiles_id: 'profile-recruiter' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData())).toEqual({ error: 'CANDIDATE_NOT_JOBSEEKER' })
  })
})
