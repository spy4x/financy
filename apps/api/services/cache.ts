import { KeyValueService } from "@server/kv"
import {
  Account,
  Category,
  Currency,
  Group,
  GroupMembership,
  Tag,
  Transaction,
  User,
  UserKey,
  UserSession,
  UserSettings,
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

export interface TelegramBotSession {
  chatId: number
  state?: string
  data?: Record<string, unknown>
  lastActivity: Date
}

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
  userSettings = buildMethods<UserSettings>(`userSettings`)
  group = buildMethods<Group>(`group`)
  groupMembership = buildMethods<GroupMembership>(`groupMembership`)
  account = buildMethods<Account>(`account`)
  category = buildMethods<Category>(`category`)
  currency = buildMethods<Currency>(`currency`)
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

  /**
   * Telegram Bot Session Storage
   * Production-ready session management using Redis/Valkey
   */
  telegramSession = {
    prefix: "tg_session",
    ttl: CacheTTL.day, // 24 hours

    key: (chatId: number): string => `${this.telegramSession.prefix}:${chatId}`,

    /**
     * Get session for a chat
     */
    get: async (chatId: number): Promise<TelegramBotSession | null> => {
      try {
        const sessionData = await cacheService.get<TelegramBotSession>(
          this.telegramSession.key(chatId),
        )

        if (!sessionData) {
          return null
        }

        // Check if session is still valid (not expired due to inactivity)
        const now = new Date()
        const lastActivity = new Date(sessionData.lastActivity)
        const diffHours = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)

        if (diffHours > 24) {
          await this.telegramSession.delete(chatId)
          return null
        }

        return sessionData
      } catch (error) {
        console.error("Failed to get Telegram session:", error)
        return null
      }
    },

    /**
     * Create or update session for a chat
     */
    set: async (
      chatId: number,
      state?: string,
      data?: Record<string, unknown>,
    ): Promise<void> => {
      try {
        const session: TelegramBotSession = {
          chatId,
          state,
          data,
          lastActivity: new Date(),
        }

        await cacheService.set(this.telegramSession.key(chatId), session, this.telegramSession.ttl)
      } catch (error) {
        console.error("Failed to set Telegram session:", error)
      }
    },

    /**
     * Update session state and data
     */
    update: async (
      chatId: number,
      updates: Partial<Pick<TelegramBotSession, "state" | "data">>,
    ): Promise<void> => {
      try {
        const existingSession = await this.telegramSession.get(chatId)
        if (!existingSession) {
          console.warn(`Cannot update non-existent session for chat ${chatId}`)
          return
        }

        const updatedSession: TelegramBotSession = {
          ...existingSession,
          ...updates,
          lastActivity: new Date(),
        }

        await cacheService.set(
          this.telegramSession.key(chatId),
          updatedSession,
          this.telegramSession.ttl,
        )
      } catch (error) {
        console.error("Failed to update Telegram session:", error)
      }
    },

    /**
     * Clear session state (keep user info but clear workflow state)
     */
    clearState: async (chatId: number): Promise<void> => {
      await this.telegramSession.update(chatId, { state: undefined, data: undefined })
    },

    /**
     * Completely remove session
     */
    delete: async (chatId: number): Promise<void> => {
      try {
        await cacheService.delete(this.telegramSession.key(chatId))
      } catch (error) {
        console.error("Failed to clear Telegram session:", error)
      }
    },
  }
}

export const publicAPICache = new PublicAPICache()
