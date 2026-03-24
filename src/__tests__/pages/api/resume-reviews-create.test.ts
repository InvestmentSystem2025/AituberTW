import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/resume-reviews/create'

jest.mock('@/lib/authContext', () => ({
  createAuthContext: jest.fn(),
}))

jest.mock('@/lib/resumeReviewNotifications', () => ({
  sendResumeReviewInvitationEmail: jest.fn().mockResolvedValue(undefined),
}))

const { createAuthContext } = jest.requireMock('@/lib/authContext')

function buildCtx(options?: { standards?: boolean; capacityReached?: boolean; member?: boolean }) {
  const standards = options?.standards ?? true
  const capacityReached = options?.capacityReached ?? false
  const member = options?.member ?? true

  return {
    getProfile: jest.fn().mockResolvedValue({ id: 'p1' }),
    isCompanyMember: jest.fn().mockResolvedValue(member),
    supa: {
      from: jest.fn((table: string) => {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          limit: jest.fn(() => chain),
          maybeSingle: jest.fn(async () => {
            if (table === 'job_opening') {
              return {
                data: {
                  id: 'j1',
                  job_title: 'Engineer',
                  target_hires: 1,
                  hired_count: capacityReached ? 1 : 0,
                },
              }
            }
            if (table === 'company') return { data: { company_name: 'ACME' } }
            return { data: null }
          }),
          single: jest.fn(async () => ({ data: { id: 'req1' } })),
          insert: jest.fn(() => chain),
        }
        if (table === 'resume_review_standards') {
          chain.limit = jest.fn(async () => ({
            data: standards ? [{ id: 's1' }] : [],
          }))
        }
        return chain
      }),
    },
  }
}

describe('/api/resume-reviews/create', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects without standards', async () => {
    createAuthContext.mockReturnValue(buildCtx({ standards: false }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData())).toEqual({ error: 'MISSING_REVIEW_STANDARD' })
  })

  it('rejects when capacity reached', async () => {
    createAuthContext.mockReturnValue(buildCtx({ capacityReached: true }))
    const { req, res } = createMocks({
      method: 'POST',
      body: { company_id: 'c1', job_opening_id: 'j1', candidate_email: 'a@b.com' },
    })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData())).toEqual({ error: 'CAPACITY_REACHED' })
  })
})
