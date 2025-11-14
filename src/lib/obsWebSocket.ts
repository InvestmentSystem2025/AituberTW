const DEFAULT_OBS_URL = 'ws://127.0.0.1:4455'
const RPC_VERSION = 1

interface OBSWebSocketHello {
  op: number
  d: {
    obsWebSocketVersion: string
    rpcVersion: number
    authentication?: {
      challenge: string
      salt: string
    }
  }
}

interface OBSWebSocketRequestResponse {
  op: number
  d: {
    requestId: string
    requestType: string
    requestStatus: {
      result: boolean
      code: number
      comment?: string
    }
    responseData?: Record<string, unknown>
  }
}

const toBase64 = (buffer: ArrayBuffer) => {
  const uint8Array = new Uint8Array(buffer)
  let binary = ''
  uint8Array.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const sha256 = async (input: string) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return toBase64(hashBuffer)
}

const computeAuthentication = async (
  password: string,
  salt: string,
  challenge: string
) => {
  const secret = await sha256(password + salt)
  return sha256(secret + challenge)
}

let requestCounter = 0

class OBSWebSocketClient {
  private socket?: WebSocket
  private url: string
  private password?: string
  private isIdentified = false
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void
      reject: (reason?: any) => void
    }
  >()

  constructor({ url, password }: { url?: string; password?: string } = {}) {
    this.url = url || process.env.NEXT_PUBLIC_OBS_WEBSOCKET_URL || DEFAULT_OBS_URL
    this.password = password || process.env.NEXT_PUBLIC_OBS_WEBSOCKET_PASSWORD
  }

  async connect(): Promise<void> {
    if (this.socket && this.isIdentified) {
      return
    }

    if (typeof window === 'undefined') {
      throw new Error('OBS WebSocket can only be used in the browser')
    }

    this.socket = new WebSocket(this.url)

    await new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Failed to create OBS WebSocket connection'))
        return
      }

      const timer = window.setTimeout(() => {
        reject(new Error('Timed out while connecting to OBS WebSocket'))
      }, 5000)

      this.socket!.addEventListener('open', () => {
        window.clearTimeout(timer)
      })

      this.socket!.addEventListener('error', (event) => {
        window.clearTimeout(timer)
        reject(event)
      })

      this.socket!.addEventListener('close', () => {
        this.isIdentified = false
      })

      this.socket!.addEventListener('message', async (event) => {
        const payload = JSON.parse(event.data) as OBSWebSocketHello | OBSWebSocketRequestResponse

        switch (payload.op) {
          case 0: {
            const { authentication } = payload.d
            let authPayload: string | undefined
            if (authentication?.challenge && authentication?.salt && this.password) {
              authPayload = await computeAuthentication(
                this.password,
                authentication.salt,
                authentication.challenge
              )
            }

            this.sendRaw({
              op: 1,
              d: {
                rpcVersion: RPC_VERSION,
                eventSubscriptions: 0,
                authentication: authPayload,
              },
            })
            break
          }
          case 2: {
            this.isIdentified = true
            resolve()
            break
          }
          case 7: {
            const requestResponse = payload as OBSWebSocketRequestResponse
            const handlers = this.pendingRequests.get(requestResponse.d.requestId)
            if (handlers) {
              this.pendingRequests.delete(requestResponse.d.requestId)
              if (requestResponse.d.requestStatus.result) {
                handlers.resolve(requestResponse.d.responseData)
              } else {
                handlers.reject(
                  new Error(
                    requestResponse.d.requestStatus.comment ||
                      `OBS request failed with code ${requestResponse.d.requestStatus.code}`
                  )
                )
              }
            }
            break
          }
          default:
            break
        }
      })
    })
  }

  private ensureConnected() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.isIdentified) {
      throw new Error('OBS WebSocket is not connected')
    }
  }

  private sendRaw(payload: unknown) {
    this.socket?.send(JSON.stringify(payload))
  }

  async sendRequest(requestType: string, requestData?: Record<string, unknown>) {
    this.ensureConnected()
    const requestId = `req-${++requestCounter}`

    return new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject })
      this.sendRaw({
        op: 6,
        d: {
          requestType,
          requestId,
          requestData,
        },
      })
    })
  }

  async setStreamSettings({
    streamKey,
    ingestionAddress,
  }: {
    streamKey: string
    ingestionAddress: string
  }) {
    await this.sendRequest('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_common',
      streamServiceSettings: {
        server: ingestionAddress,
        key: streamKey,
        use_auth: false,
      },
    })
  }

  async startStreaming() {
    await this.sendRequest('StartStream')
  }

  async stopStreaming() {
    await this.sendRequest('StopStream')
  }

  async startRecording() {
    await this.sendRequest('StartRecord')
  }

  async stopRecording() {
    await this.sendRequest('StopRecord')
  }

  disconnect() {
    if (this.socket) {
      this.socket.close()
      this.socket = undefined
      this.isIdentified = false
    }
  }
}

export const configureObsStream = async (options: {
  streamKey: string
  ingestionAddress: string
  url?: string
  password?: string
}) => {
  const client = new OBSWebSocketClient(options)
  await client.connect()
  try {
    await client.setStreamSettings({
      streamKey: options.streamKey,
      ingestionAddress: options.ingestionAddress,
    })
  } finally {
    client.disconnect()
  }
}

export const startObsStream = async (options: { url?: string; password?: string } = {}) => {
  const client = new OBSWebSocketClient(options)
  await client.connect()
  try {
    try {
      await client.startStreaming()
    } catch (error: any) {
      console.warn('[OBS] start streaming failed', error)
    }
    try {
      await client.startRecording()
    } catch (error: any) {
      if (String(error?.message || '').includes('already')) {
        console.info('[OBS] recording already active')
      } else {
        console.warn('[OBS] start recording failed', error)
      }
    }
  } finally {
    client.disconnect()
  }
}

export const stopObsStream = async (options: { url?: string; password?: string } = {}) => {
  const client = new OBSWebSocketClient(options)
  await client.connect()
  try {
    try {
      await client.stopStreaming()
    } catch (error: any) {
      if (String(error?.message || '').includes('inactive')) {
        console.info('[OBS] stream already stopped')
      } else {
        console.warn('[OBS] stop streaming failed', error)
      }
    }
    try {
      await client.stopRecording()
    } catch (error: any) {
      if (String(error?.message || '').includes('inactive')) {
        console.info('[OBS] recording already stopped')
      } else {
        console.warn('[OBS] stop recording failed', error)
      }
    }
  } finally {
    client.disconnect()
  }
}


