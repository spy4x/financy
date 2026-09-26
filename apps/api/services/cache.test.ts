/**
 * What financy relies on from `CacheService` and `buildMethods` (`@spy4x/platform/cache`), which
 * replaced financy's own copies. `cache.ts` itself connects to Redis when imported, so these tests
 * build the service over an in-memory storage the same way `cache.ts` builds it over Redis.
 */
import { describe, expect, it } from "@shared/testing"
import { SessionMFAStatus, UserSession, UserSessionStatus } from "@shared/types"
import { buildMethods, CacheService, type ICacheStorage } from "@spy4x/platform/cache"
import { isSessionExpired } from "./auth/session-expiry.ts"
import { createCacheService } from "./cache-service.ts"

/** An in-memory `ICacheStorage` that records the ttl of every write. */
function memoryCacheStorage(): ICacheStorage & { ttls: number[] } {
  const values = new Map<string, string>()
  const ttls: number[] = []
  return {
    ttls,
    get: (key) => Promise.resolve(values.get(key) ?? null),
    set: (key, value, ttlSec) => {
      values.set(key, value)
      ttls.push(ttlSec)
      return Promise.resolve()
    },
    del: (key) => Promise.resolve(void values.delete(key)),
    reset: () => Promise.resolve(values.clear()),
  }
}

describe("CacheService", () => {
  it("wrap() runs the loader once for concurrent misses on one key", async () => {
    const cache = new CacheService(memoryCacheStorage())
    let loads = 0
    const load = async () => {
      loads++
      await new Promise((resolve) => setTimeout(resolve, 0))
      return { id: 1 }
    }
    const results = await Promise.all([
      cache.wrap("user_1", load, 60),
      cache.wrap("user_1", load, 60),
    ])
    expect(loads).toBe(1)
    expect(results).toEqual([{ id: 1 }, { id: 1 }])
  })

  it("set() rounds a fractional ttl up to whole seconds and rejects a ttl of zero", async () => {
    const storage = memoryCacheStorage()
    const cache = new CacheService(storage)
    await cache.set("a", 1, 1.5)
    expect(storage.ttls).toEqual([2])
    await expect(cache.set("b", 1, 0)).rejects.toThrow(RangeError)
  })
})

describe("buildMethods", () => {
  it("get() returns a cached falsy value instead of treating it as a miss", async () => {
    const cache = new CacheService(memoryCacheStorage())
    const counters = buildMethods<number>(cache, "counter", 60)
    await counters.set(1, 0)
    expect(await counters.get(1)).toBe(0)
  })
})

describe("createCacheService", () => {
  it("rejects a cached session whose expiresAt is in the past", async () => {
    const sessions = buildMethods<UserSession>(
      createCacheService(memoryCacheStorage()),
      `userSession`,
      60,
    )
    const now = new Date(`2026-06-01T12:00:00.000Z`)
    await sessions.set(1, {
      id: 1,
      createdAt: new Date(`2026-01-01T00:00:00.000Z`),
      updatedAt: new Date(`2026-01-01T00:00:00.000Z`),
      token: `hashed`,
      userId: 1,
      keyId: 1,
      status: UserSessionStatus.ACTIVE,
      mfa: SessionMFAStatus.NOT_REQUIRED,
      expiresAt: new Date(`2026-05-31T12:00:00.000Z`),
    })
    // The same read `db.userSession.findOne` makes: a `wrap` that hits the cache.
    const cached = await sessions.wrap(1, () => Promise.reject(new Error(`cache miss`)))
    expect(cached.expiresAt).toBeInstanceOf(Date)
    expect(isSessionExpired(cached, now)).toBe(true)
  })

  it("returns timestamp and lastActivity as dates, and a plain date string as a string", async () => {
    const cache = createCacheService(memoryCacheStorage())
    const timestamp = new Date(`2026-02-03T04:05:06.007Z`)
    await cache.set(`k`, { timestamp, lastActivity: timestamp, date: `2026-02-03` }, 60)
    expect(await cache.get(`k`)).toEqual({
      timestamp,
      lastActivity: timestamp,
      date: `2026-02-03`,
    })
  })
})
