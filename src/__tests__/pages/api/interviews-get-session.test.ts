import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/interviews/get-session'

jest.mock('@/lib/authContext', () => ({
  createAuthContext: jest.fn(),
}))

const { createAuthContext } = jest.requireMock('@/lib/authContext')

function buildCtx(options?: {
  role?: 'jobSeeker' | 'recruiter'
  profileId?: string
  email?: string
  member?: boolean
}) {
  const role = options?.role ?? 'jobSeeker'
  const profileId = options?.profileId ?? 'me-p1'
  const email = options?.email ?? 'me@example.com'
  const member = options?.member ?? true

  const supa = {
    from: jest.fn((table: string) => {
      const state: Record<string, any> = {}
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn((k: string, v: any) => {
          state[k] = v
          return chain
        }),
        single: jest.fn(async () => {
          if (table === 'interviews') {
            return {
              data: {
                id: state['id'] || 'iv1',
                company_id: 'c1',
                profiles_id: 'owner-p1',
                candidate_email: 'owner@example.com',
              },
            }
          }
          return { data: null }
        }),
        maybeSingle: jest.fn(async () => {
          if (table === 'company_members') return { data: member ? { id: 'cm1' } : null }
          if (table === 'interview_sessions') return { data: { id: 's1', interviews_id: state['interviews_id'] || 'iv1' } }
          return { data: null }
        }),
        order: jest.fn(() => chain),
        limit: jest.fn(() => chain),
      }
      return chain
    }),
  }

  return {
    getAuthUserId: jest.fn().mockResolvedValue('auth-1'),
    requireProfile: jest.fn().mockResolvedValue({
      id: profileId,
      role,
      email,
    }),
    supa,
  }
}

describe('/api/interviews/get-session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects jobSeeker reading others session', async () => {
    createAuthContext.mockReturnValue(
      buildCtx({ role: 'jobSeeker', profileId: 'not-owner', email: 'not-owner@example.com' })
    )
    const { req, res } = createMocks({ method: 'GET', query: { interview_id: 'iv1' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(403)
    expect(JSON.parse(res._getData())).toEqual({ error: 'FORBIDDEN' })
  })

  it('rejects recruiter without company membership', async () => {
    createAuthContext.mockReturnValue(buildCtx({ role: 'recruiter', profileId: 'r1', member: false }))
    const { req, res } = createMocks({ method: 'GET', query: { interview_id: 'iv1' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(403)
    expect(JSON.parse(res._getData())).toEqual({ error: 'FORBIDDEN' })
  })

  it('allows matched jobSeeker', async () => {
    createAuthContext.mockReturnValue(
      buildCtx({ role: 'jobSeeker', profileId: 'owner-p1', email: 'owner@example.com' })
    )
    const { req, res } = createMocks({ method: 'GET', query: { interview_id: 'iv1' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toMatchObject({ session: { id: 's1' } })
  })
})
