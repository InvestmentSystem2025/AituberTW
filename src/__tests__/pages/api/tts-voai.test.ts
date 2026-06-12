/** @jest-environment node */

import { createMocks } from 'node-mocks-http'
import handler from '@/pages/api/tts-voai'

describe('/api/tts-voai', () => {
  const originalApiKey = process.env.VOAI_API_KEY
  const originalVersion = process.env.VOAI_TTS_VERSION

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.VOAI_API_KEY = 'server-api-key'
    delete process.env.VOAI_TTS_VERSION
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
  })

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.VOAI_API_KEY
    else process.env.VOAI_API_KEY = originalApiKey

    if (originalVersion === undefined) delete process.env.VOAI_TTS_VERSION
    else process.env.VOAI_TTS_VERSION = originalVersion
  })

  it('uses Neo as the default VOAI TTS version', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        text: '測試',
        speaker: '柔洢',
        style: '預設',
      },
    })

    await handler(req, res)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://connect.voai.ai/TTS/Speech',
      expect.objectContaining({
        body: expect.any(String),
      })
    )

    const request = (global.fetch as jest.Mock).mock.calls[0][1]
    expect(JSON.parse(request.body)).toEqual(
      expect.objectContaining({
        version: 'Neo',
        speaker: '柔洢',
      })
    )
    expect(res._getStatusCode()).toBe(200)
  })

  it('allows the server environment to override the VOAI TTS version', async () => {
    process.env.VOAI_TTS_VERSION = 'Future'
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        text: '測試',
        speaker: '柔洢',
      },
    })

    await handler(req, res)

    const request = (global.fetch as jest.Mock).mock.calls[0][1]
    expect(JSON.parse(request.body).version).toBe('Future')
    expect(res._getStatusCode()).toBe(200)
  })
})
