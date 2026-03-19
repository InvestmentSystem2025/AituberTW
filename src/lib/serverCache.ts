/**
 * Lightweight in-process server-side cache with TTL support.
 *
 * Designed to be the minimal-invasion cache layer:
 * - Works with a single Next.js instance out of the box
 * - Can be replaced with Redis / Vercel KV in the future by swapping the
 *   `get`/`set`/`del` implementation — the callers stay unchanged.
 *
 * Usage:
 *   const data = await serverCache.getOrSet('my-key', 60, () => expensiveFetch())
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number  // Date.now() ms
}

class ServerCache {
  private store = new Map<string, CacheEntry<unknown>>()

  /** Retrieve a cached value. Returns undefined if missing or expired. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  /** Store a value with a TTL in seconds. */
  set<T>(key: string, ttlSeconds: number, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  /** Invalidate a specific key. */
  del(key: string): void {
    this.store.delete(key)
  }

  /**
   * Get from cache or compute + cache.
   * TTL is in seconds.
   */
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== undefined) return cached

    const value = await compute()
    this.set(key, ttlSeconds, value)
    return value
  }
}

// Module singleton — persists across requests in the same Node.js process
export const serverCache = new ServerCache()
