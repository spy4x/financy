import { CacheService, type ICacheStorage, reviveIsoDatesEndingInAt } from "@spy4x/platform/cache"

/**
 * Cached date fields whose names do not end in `At`, so `reviveIsoDatesEndingInAt` alone would
 * leave them as ISO strings: `Transaction.timestamp` and `TelegramBotSession.lastActivity`.
 * `ExchangeRate.date` is not listed on purpose. Postgres returns that `DATE` column as a `Date`, so
 * the cache holds an ISO timestamp and a cache hit returns it as a string, which matches its
 * declared `string` type. Nothing reads it from the cache today. Reviving the key `date` would also
 * reach free-form cached data, such as a Telegram session's `data`.
 */
const DATE_KEYS_NOT_ENDING_IN_AT = new Set([`timestamp`, `lastActivity`])

/**
 * `JSON.parse` reviver for every value financy reads back from its cache: turns an ISO-8601 UTC
 * string into a `Date` when its key ends in `At` or is one of {@link DATE_KEYS_NOT_ENDING_IN_AT}.
 * Without it, a cached `expiresAt` comes back as a string and `expiresAt < new Date()` is never
 * true (financy#59).
 */
export function reviveCachedDates(key: string, value: unknown): unknown {
  // A listed key is checked as if it ended in `At`, so both paths share ts-libs' ISO pattern.
  return reviveIsoDatesEndingInAt(DATE_KEYS_NOT_ENDING_IN_AT.has(key) ? `${key}At` : key, value)
}

/** The `CacheService` financy uses, over any storage. `cache.ts` passes Redis. */
export function createCacheService(storage: ICacheStorage): CacheService {
  return new CacheService(storage, { reviver: reviveCachedDates })
}
