import { Redis } from "ioredis"

import {
  Gateway,
  Lamp,
  LampBox,
  LampProfile,
  Region,
  Schedule,
  Sensor,
  User,
  UserKey,
  UserSession,
  Zone,
  ZoneLampBox,
  ZoneSchedule,
} from "$shared/types"
import {
  ONE_DAY_IN_MILLISECONDS,
  ONE_HOUR_IN_MILLISECONDS,
  ONE_MINUTE_IN_MILLISECONDS,
  ONE_MONTH_IN_MILLISECONDS,
  ONE_WEEK_IN_MILLISECONDS,
} from "$shared/constants"

import { config } from "../services/config.ts"

interface CacheOptions {
  shouldSaveFalsy?: boolean
}

export interface ICacheService {
  get<T>(key: string): Promise<null | T>
  set<T>(key: string, value: T, ttlMs: number): Promise<void>
  delete(key: string): Promise<void>
  wrap<T>(key: string, fn: () => Promise<T>, ttlMs: number, options?: CacheOptions): Promise<T>
  reset(): Promise<void>
}

export class CacheService implements ICacheService {
  private readonly redis: Redis

  constructor() {
    this.redis = new Redis(config.redis.url)
  }

  public async get<T>(key: string): Promise<null | T> {
    const data = await this.redis.get(key)
    if (!data) {
      return null
    }
    const expiresAt = (await this.redis.expiretime(key)) * 1000
    if (expiresAt < Date.now()) {
      await this.redis.del(key)
      return null
    }
    return JSON.parse(data) as T
  }

  public async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.redis.set(key, JSON.stringify(value), "EXAT", Math.floor((Date.now() + ttlMs) / 1000))
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(key)
  }

  public async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs: number,
    options: CacheOptions = { shouldSaveFalsy: false },
  ): Promise<T> {
    const data = await this.redis.get(key)
    const expiresAt = (await this.redis.expiretime(key)) * 1000
    if (data && expiresAt >= Date.now()) {
      return JSON.parse(data) as T
    }
    const value = await fn()
    if (value || options.shouldSaveFalsy) {
      await this.set(key, value, ttlMs)
    }
    return value
  }

  public async reset(): Promise<void> {
    await this.redis.flushdb()
  }
}

export const redisCacheService = new CacheService()

export enum CacheTTL {
  threeMin = 3 * ONE_MINUTE_IN_MILLISECONDS,
  fiveMin = 5 * ONE_MINUTE_IN_MILLISECONDS,
  oneHour = ONE_HOUR_IN_MILLISECONDS,
  day = ONE_DAY_IN_MILLISECONDS,
  week = ONE_WEEK_IN_MILLISECONDS,
  month = ONE_MONTH_IN_MILLISECONDS,
}

export type PublicAPICacheModel<T> = {
  key: (id: number) => string
  ttl: CacheTTL
  get: (id: number) => Promise<null | T>
  set: (id: number, item: T) => Promise<void>
  delete: (id: number) => Promise<void>
  wrap: (id: number, fn: () => Promise<T>) => Promise<T>
}

const buildMethods = <T>(
  prefix: string,
  ttl: CacheTTL = CacheTTL.month,
): PublicAPICacheModel<T> => {
  const key = (id: number): string => `${prefix}_${id}`
  return {
    key,
    ttl,
    get: async (id: number): Promise<null | T> => {
      return redisCacheService.get<T>(key(id))
    },
    set: async (id: number, item: T): Promise<void> => {
      return redisCacheService.set(key(id), item, ttl)
    },
    delete: async (id: number): Promise<void> => {
      return redisCacheService.delete(key(id))
    },
    wrap: async (id: number, fn: () => Promise<T>): Promise<T> => {
      return redisCacheService.wrap<T>(key(id), fn, ttl)
    },
  }
}

export class PublicAPICache {
  user = buildMethods<User>(`user`)
  userKey = buildMethods<UserKey>(`userKey`)
  userSession = buildMethods<UserSession>(`userSession`)
  zone = buildMethods<Zone>(`zone`)
  lampBox = buildMethods<LampBox>(`lampBox`)
  zoneLampBox = buildMethods<ZoneLampBox>(`zoneLampBox`)
  sensor = buildMethods<Sensor>(`sensor`)
  gateway = buildMethods<Gateway>(`gateway`)
  lampProfile = buildMethods<LampProfile>(`lampProfile`)
  lamp = buildMethods<Lamp>(`lamp`)
  region = buildMethods<Region>(`region`)
  schedule = buildMethods<Schedule>(`schedule`)
  zoneSchedule = buildMethods<ZoneSchedule>(`zoneSchedule`)

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
