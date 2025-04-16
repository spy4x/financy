import { Redis } from "ioredis"

import { User, UserKey, UserSession, ValidationSchema } from "@shared/types"
import {
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_MONTH_IN_SECONDS,
  ONE_WEEK_IN_SECONDS,
  SECONDS_IN_MINUTE,
} from "@shared/constants"

import { config } from "../services/config.ts"

import { buildMethods as buildMethodsBase, CacheService } from "@shared/cache"

const redis = new Redis(config.redis.url)

const redisCacheService = new CacheService({
  get: redis.get.bind(redis),
  set: async (key: string, value: string, ttlMs: number): Promise<void> => {
    await redis.set(key, value, "EX", ttlMs)
  },
  del: async (key: string): Promise<void> => {
    await redis.del(key)
  },
  reset: async (): Promise<void> => {
    await redis.flushdb()
  },
})

function buildMethods<T>(prefix: string, schema?: ValidationSchema<T>) {
  return buildMethodsBase<T>(redisCacheService, prefix, ONE_MONTH_IN_SECONDS, schema)
}

export enum CacheTTL {
  threeMin = 3 * SECONDS_IN_MINUTE,
  fiveMin = 5 * SECONDS_IN_MINUTE,
  oneHour = ONE_HOUR_IN_SECONDS,
  day = ONE_DAY_IN_SECONDS,
  week = ONE_WEEK_IN_SECONDS,
  month = ONE_MONTH_IN_SECONDS,
}

export class PublicAPICache {
  user = buildMethods<User>(`user`)
  userKey = buildMethods<UserKey>(`userKey`)
  userSession = buildMethods<UserSession>(`userSession`)

  isSessionTokenExpired = {
    key: (sessionToken: string): string => `isSessionTokenExpired_${sessionToken}`,
    ttl: CacheTTL.day,

    get: async (sessionToken: string): Promise<null | boolean> => {
      return redisCacheService.get<boolean>(this.isSessionTokenExpired.key(sessionToken))
    },
    set: async (sessionToken: string, isExpired = true): Promise<void> => {
      return redisCacheService.set(
        this.isSessionTokenExpired.key(sessionToken),
        isExpired,
        this.isSessionTokenExpired.ttl,
      )
    },
    delete: async (sessionToken: string): Promise<void> => {
      return redisCacheService.delete(this.isSessionTokenExpired.key(sessionToken))
    },
    wrap: async (sessionToken: string, fn: () => Promise<boolean>): Promise<boolean> => {
      return redisCacheService.wrap<boolean>(
        this.isSessionTokenExpired.key(sessionToken),
        fn,
        this.isSessionTokenExpired.ttl,
      )
    },
  }
}

export const publicAPICache = new PublicAPICache()
