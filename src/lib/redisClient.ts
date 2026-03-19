/**
 * Redis client singleton with graceful degradation.
 *
 * If REDIS_URL is not set, all operations return null/fallback values
 * so the system can operate without Redis (with reduced rate-limiting accuracy).
 *
 * Redis key schema:
 *   token:daily:{YYYYMMDD}              → global daily total (TTL 48h)
 *   token:user:{userId}:daily:{YYYYMMDD} → per-user daily total (TTL 48h)
 */
import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL as string | undefined

// TTL for daily counters: 48 hours (cron cleanup is primary; this is fallback)
export const REDIS_DAILY_TTL_SECONDS = 48 * 60 * 60

let _client: Redis | null = null

export function getRedisClient(): Redis | null {
  if (!REDIS_URL) return null
  if (_client) return _client

  _client = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
    commandTimeout: 2000,
    enableOfflineQueue: false,
  })

  _client.on('error', (err) => {
    console.error('[Redis] connection error:', err.message)
  })

  return _client
}

/** Build global daily key: token:daily:YYYYMMDD (Asia/Taipei) */
export function globalDailyKey(yyyymmdd: string): string {
  return `token:daily:${yyyymmdd}`
}

/** Build per-user daily key: token:user:{userId}:daily:YYYYMMDD */
export function userDailyKey(userId: string, yyyymmdd: string): string {
  return `token:user:${userId}:daily:${yyyymmdd}`
}

/**
 * Atomically increment daily counter for both global and user scopes.
 * Sets TTL on first creation (INCRBY + EXPIRE only when key is new).
 *
 * Returns the NEW global total after increment, or null if Redis is unavailable.
 */
export async function incrTokenCounters(params: {
  totalTokens: number
  userId: string | null
  yyyymmdd: string
}): Promise<number | null> {
  const redis = getRedisClient()
  if (!redis) return null

  const { totalTokens, userId, yyyymmdd } = params
  const globalKey = globalDailyKey(yyyymmdd)

  try {
    const pipeline = redis.pipeline()

    // Increment global counter
    pipeline.incrby(globalKey, totalTokens)
    // Set TTL only if key is new (NX option ensures idempotency)
    pipeline.expire(globalKey, REDIS_DAILY_TTL_SECONDS, 'NX' as any)

    if (userId) {
      const userKey = userDailyKey(userId, yyyymmdd)
      pipeline.incrby(userKey, totalTokens)
      pipeline.expire(userKey, REDIS_DAILY_TTL_SECONDS, 'NX' as any)
    }

    const results = await pipeline.exec()
    if (!results) return null

    // results[0] = [err, newGlobalTotal]
    const newGlobalTotal = results[0]?.[1] as number | null
    return typeof newGlobalTotal === 'number' ? newGlobalTotal : null
  } catch (err) {
    console.error('[Redis] incrTokenCounters failed:', err)
    return null
  }
}

/**
 * Get current daily total from Redis.
 * Returns null if Redis is unavailable or key does not exist.
 */
export async function getDailyTotal(yyyymmdd: string): Promise<number | null> {
  const redis = getRedisClient()
  if (!redis) return null

  try {
    const val = await redis.get(globalDailyKey(yyyymmdd))
    if (val === null) return 0
    return parseInt(val, 10) || 0
  } catch (err) {
    console.error('[Redis] getDailyTotal failed:', err)
    return null
  }
}

/**
 * Delete daily counter keys for a given date (called by daily aggregation cron).
 */
export async function deleteDailyKeys(yyyymmdd: string, userIds: string[]): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    const keys = [
      globalDailyKey(yyyymmdd),
      ...userIds.map((uid) => userDailyKey(uid, yyyymmdd)),
    ]
    if (keys.length > 0) await redis.del(...keys)
  } catch (err) {
    console.error('[Redis] deleteDailyKeys failed:', err)
  }
}
