import { createMocks } from 'node-mocks-http'
import { TextEncoder, TextDecoder } from 'util'

jest.mock('@/lib/supabaseServer', () => ({
  getAuthUserIdFromRequest: jest.fn(),
  getServiceClient: jest.fn(),
}))

const { getAuthUserIdFromRequest } = jest.requireMock('@/lib/supabaseServer')

describe('/api/resume-reviews/public/submit', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    ;(global as any).TextEncoder = TextEncoder
    ;(global as any).TextDecoder = TextDecoder
  })

  it('returns LOGIN_REQUIRED when user not logged in', async () => {
    const handler = require('@/pages/api/resume-reviews/public/submit').default
    getAuthUserIdFromRequest.mockResolvedValue(null)
    const { req, res } = createMocks({ method: 'POST' })
    await handler(req as any, res as any)
    expect(res._getStatusCode()).toBe(401)
    expect(JSON.parse(res._getData())).toEqual({ error: 'LOGIN_REQUIRED' })
  })

})
