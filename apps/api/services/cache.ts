import { KeyValueService } from "@server/kv"
import {
  Account,
  Category,
  Group,
  GroupMembership,
  Tag,
  Transaction,
  User,
  UserKey,
  UserSession,
  ValidationSchema,
} from "@shared/types"
import {
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_MONTH_IN_SECONDS,
  ONE_WEEK_IN_SECONDS,
  SECONDS_IN_MINUTE,
} from "@shared/constants/+index.ts"

import { config } from "../services/config.ts"

import { buildMethods as buildMethodsBase, CacheService } from "@shared/cache"

const kv = await KeyValueService.connect(config.kv.hostname, config.kv.port)
const cacheService = new CacheService(kv)

function buildMethods<T>(prefix: string, schema?: ValidationSchema) {
  return buildMethodsBase<T>(cacheService, prefix, ONE_MONTH_IN_SECONDS, schema)
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
  group = buildMethods<Group>(`group`)
  groupMembership = buildMethods<GroupMembership>(`groupMembership`)
  account = buildMethods<Account>(`account`)
  category = buildMethods<Category>(`category`)
  tag = buildMethods<Tag>(`tag`)

  transaction = buildMethods<Transaction>(`transaction`)

  isSessionTokenExpired = {
    key: (sessionToken: string): string => `isSessionTokenExpired_${sessionToken}`,
    ttl: CacheTTL.day,

    get: async (sessionToken: string): Promise<null | boolean> => {
      return cacheService.get<boolean>(this.isSessionTokenExpired.key(sessionToken))
    },
    set: async (sessionToken: string, isExpired = true): Promise<void> => {
      return cacheService.set(
        this.isSessionTokenExpired.key(sessionToken),
        isExpired,
        this.isSessionTokenExpired.ttl,
      )
    },
    delete: async (sessionToken: string): Promise<void> => {
      return cacheService.delete(this.isSessionTokenExpired.key(sessionToken))
    },
    wrap: async (sessionToken: string, fn: () => Promise<boolean>): Promise<boolean> => {
      return cacheService.wrap<boolean>(
        this.isSessionTokenExpired.key(sessionToken),
        fn,
        this.isSessionTokenExpired.ttl,
      )
    },
  }
}

export const publicAPICache = new PublicAPICache()
