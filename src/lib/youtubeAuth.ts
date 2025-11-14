export interface YouTubeCredentials {
  installed?: {
    client_id: string
    client_secret: string
    redirect_uris: string[]
  }
  web?: {
    client_id: string
    client_secret: string
    redirect_uris: string[]
  }
}

export interface StoredYouTubeTokens {
  access_token: string
  refresh_token: string
  scope?: string
  token_type: string
  expiry_date: number
}

const DEFAULT_CREDENTIALS_PATH = 'youtube-oauth-credentials.json'
const DEFAULT_TOKEN_PATH = 'youtube-oauth-token.json'

const getCredentialsPath = () =>
  process.env.YOUTUBE_OAUTH_CREDENTIALS_PATH || DEFAULT_CREDENTIALS_PATH

const getTokenPath = () =>
  process.env.YOUTUBE_OAUTH_TOKEN_PATH || DEFAULT_TOKEN_PATH

const fs = () => import('node:fs/promises')
const path = () => import('node:path')

const resolvePath = async (targetPath: string) => {
  const pathModule = await path()
  return pathModule.isAbsolute(targetPath)
    ? targetPath
    : pathModule.join(process.cwd(), targetPath)
}

export const readCredentials = async (
  customPath?: string
): Promise<YouTubeCredentials> => {
  const fsModule = await fs()
  const filePath = await resolvePath(customPath || getCredentialsPath())
  try {
    const raw = await fsModule.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `YouTube OAuth credentials file not found. Expected at ${filePath}. Set YOUTUBE_OAUTH_CREDENTIALS_PATH if using a custom location.`
      )
    }
    throw error
  }
}

export const readStoredTokens = async (
  customPath?: string
): Promise<StoredYouTubeTokens | null> => {
  const fsModule = await fs()
  const filePath = await resolvePath(customPath || getTokenPath())

  try {
    const raw = await fsModule.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as StoredYouTubeTokens
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export const writeStoredTokens = async (
  tokens: StoredYouTubeTokens,
  customPath?: string
): Promise<void> => {
  const fsModule = await fs()
  const filePath = await resolvePath(customPath || getTokenPath())
  await fsModule.writeFile(filePath, JSON.stringify(tokens, null, 2), 'utf-8')
}

const pickClient = (credentials: YouTubeCredentials) => {
  if (credentials.installed) {
    return credentials.installed
  }
  if (credentials.web) {
    return credentials.web
  }
  throw new Error('YouTube OAuth credentials file missing client information')
}

export const getClientConfig = async (
  customPath?: string
): Promise<{
  clientId: string
  clientSecret: string
  redirectUri: string
}> => {
  const credentials = await readCredentials(customPath)
  const client = pickClient(credentials)
  const redirectUri = client.redirect_uris?.[0]

  if (!client.client_id || !client.client_secret || !redirectUri) {
    throw new Error('YouTube OAuth credentials file missing required fields')
  }

  return {
    clientId: client.client_id,
    clientSecret: client.client_secret,
    redirectUri,
  }
}

const fetchJson = async <T>(url: string, options: RequestInit): Promise<T> => {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`YouTube OAuth request failed: ${response.status} ${text}`)
  }
  return (await response.json()) as T
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
}

const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000

export const exchangeCodeForTokens = async (params: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<StoredYouTubeTokens> => {
  const { code, clientId, clientSecret, redirectUri } = params

  const data = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetchJson<TokenResponse>(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data.toString(),
    }
  )

  if (!response.refresh_token) {
    throw new Error('YouTube OAuth response missing refresh_token')
  }

  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    scope: response.scope,
    token_type: response.token_type,
    expiry_date: Date.now() + response.expires_in * 1000 - EXPIRY_SAFETY_MARGIN_MS,
  }
}

export const refreshAccessToken = async (params: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<StoredYouTubeTokens> => {
  const { refreshToken, clientId, clientSecret } = params

  const data = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })

  const response = await fetchJson<TokenResponse>(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data.toString(),
    }
  )

  return {
    access_token: response.access_token,
    refresh_token: refreshToken,
    scope: response.scope,
    token_type: response.token_type,
    expiry_date: Date.now() + response.expires_in * 1000 - EXPIRY_SAFETY_MARGIN_MS,
  }
}

export const getValidAccessToken = async () => {
  const tokens = await readStoredTokens()
  if (!tokens) {
    throw new Error(
      'YouTube OAuth token not found. Please authorize first (check youtube-oauth-token.json or set YOUTUBE_OAUTH_TOKEN_PATH).'
    )
  }

  if (tokens.expiry_date && tokens.expiry_date > Date.now()) {
    return tokens.access_token
  }

  const { clientId, clientSecret } = await getClientConfig()

  const refreshed = await refreshAccessToken({
    refreshToken: tokens.refresh_token,
    clientId,
    clientSecret,
  })

  await writeStoredTokens(refreshed)

  return refreshed.access_token
}
