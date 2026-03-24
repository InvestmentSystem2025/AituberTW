import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/resume-reviews/public/get'

jest.mock('@/lib/supabaseServer', () => ({
  getServiceClient: jest.fn(),
}))

const { getServiceClient } = jest.requireMock('@/lib/supabaseServer')

function buildSupa(row: any) {
  return {
    from: jest.fn((table: string) => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        maybeSingle: jest.fn(async () => {
          if (table === 'resume_review_requests') return { data: row }
          if (table === 'job_opening') return { data: { id: 'j1', job_title: 'Engineer' } }
          if (table === 'company') return { data: { id: 'c1', company_name: 'ACME' } }
          return { data: null }
        }),
        order: jest.fn(() => chain),
        update: jest.fn(() => chain),
      }
      if (table === 'resume_review_standards') {
        chain.order = jest.fn(async () => ({ data: [{ name: 'React', label: 'MUST', sort_order: 1 }] }))
      }
      return chain
    }),
  }
}

describe('/api/resume-reviews/public/get', () => {
  it('rejects invalid token', async () => {
    getServiceClient.mockReturnValue(buildSupa(null))
    const { req, res } = createMocks({ method: 'GET', query: { token: 'abc' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(404)
    expect(JSON.parse(res._getData())).toEqual({ error: 'INVALID_TOKEN' })
  })

  it('rejects expired token', async () => {
    getServiceClient.mockReturnValue(
      buildSupa({
        id: 'r1',
        company_id: 'c1',
        job_opening_id: 'j1',
        status: 'invited',
        token_expires_at: '2020-01-01T00:00:00.000Z',
      })
    )
    const { req, res } = createMocks({ method: 'GET', query: { token: 'abc' } })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData())).toEqual({ error: 'TOKEN_EXPIRED' })
  })
})
