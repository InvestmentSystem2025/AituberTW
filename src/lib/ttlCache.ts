export type TtlCacheOptions = {
  ttlMs: number
  maxEntries?: number
}

type Entry<T> = {
  value: T
  expiresAt: number
}

export class TtlCache<T> {
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly map = new Map<string, Entry<T>>()
  private readonly inFlight = new Map<string, Promise<T>>()

  constructor(opts: TtlCacheOptions) {
    this.ttlMs = opts.ttlMs
    this.maxEntries = opts.maxEntries ?? 500
  }

  get(key: string): T | undefined {
    const e = this.map.get(key)
    if (!e) return undefined
    if (Date.now() >= e.expiresAt) {
      this.map.delete(key)
      return undefined
    }
    return e.value
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.maxEntries) {
      // delete oldest (in insertion order)
      const oldestKey = this.map.keys().next().value as string | undefined
      if (oldestKey) this.map.delete(oldestKey)
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  async getOrSet(key: string, factory: () => Promise<T>): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) return cached

    const existing = this.inFlight.get(key)
    if (existing) return existing

    const p = (async () => {
      try {
        const v = await factory()
        this.set(key, v)
        return v
      } finally {
        this.inFlight.delete(key)
      }
    })()
    this.inFlight.set(key, p)
    return p
  }
}

