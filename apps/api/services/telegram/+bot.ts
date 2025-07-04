/**
 * Telegram Bot Service - Main Entry Point
 *
 * This is the single entry point for all Telegram bot functionality.
 * It imports and coordinates all necessary services, uses CQRS for business logic,
 * and handles Telegram-specific concerns like UI formatting and session management.
 */

import { config } from "@api/services/config.ts"
import { queryBus } from "@api/services/queryBus.ts"
import { sleep } from "@shared/helpers/async.ts"
import {
  AccountListQuery,
  AnalyticsQuery,
  CategoryListQuery,
  TransactionListQuery,
  UserDashboardQuery,
} from "@api/cqrs/queries.ts"
import { TelegramDisplayFormatter } from "./display-formatter.ts"
import { TelegramSessionManager } from "./session-manager.ts"
import { TelegramUserUtils } from "./user-utils.ts"
import { TelegramErrorHandler } from "./error-handler.ts"

// Re-export types from old telegram-bot.old.ts for compatibility
export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: {
    id: number
    type: string
    first_name?: string
    last_name?: string
    username?: string
  }
  date: number
  text?: string
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramInlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

export interface TelegramResponse<T = unknown> {
  ok: boolean
  description?: string
  error_code?: number
  result?: T
}

/**
 * Core Telegram Bot Class
 * Handles API communication and orchestrates services
 */
class TelegramBot {
  private readonly token: string
  private readonly baseUrl: string
  private readonly displayFormatter: TelegramDisplayFormatter
  private readonly sessionManager: TelegramSessionManager
  private readonly userUtils: TelegramUserUtils
  private readonly errorHandler: TelegramErrorHandler

  constructor(token: string) {
    this.token = token
    this.baseUrl = `https://api.telegram.org/bot${token}`

    // Initialize telegram-specific services
    this.displayFormatter = new TelegramDisplayFormatter()
    this.sessionManager = new TelegramSessionManager()
    this.userUtils = new TelegramUserUtils()
    this.errorHandler = new TelegramErrorHandler()
  }

  // #region Core API Methods (from telegram-bot.old.ts)

  async getMe(): Promise<TelegramResponse<TelegramUser>> {
    return await this.request("getMe") as TelegramResponse<TelegramUser>
  }

  async getUpdates(offset?: number, timeout = 10): Promise<TelegramResponse<TelegramUpdate[]>> {
    // Clamp timeout to reasonable limits
    const clampedTimeout = Math.min(Math.max(timeout, 1), 30) // 1-30 seconds

    const params: Record<string, unknown> = {
      timeout: clampedTimeout,
      allowed_updates: ["message", "callback_query"],
      limit: 100, // Maximum allowed
    }
    if (offset !== undefined) {
      params.offset = offset
    }

    // Don't retry for getUpdates as it's called in a loop
    // Use custom timeout with buffer for long polling requests
    return await this.requestWithCustomTimeout(
      "getUpdates",
      params,
      (clampedTimeout + 5) * 1000, // 5 second buffer above polling timeout
    ) as TelegramResponse<TelegramUpdate[]>
  }

  async sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: TelegramInlineKeyboard,
    parseMode?: string,
  ): Promise<TelegramResponse<TelegramMessage>> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      text,
    }

    if (replyMarkup) params.reply_markup = replyMarkup
    if (parseMode) params.parse_mode = parseMode

    return await this.request("sendMessage", params) as TelegramResponse<TelegramMessage>
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: TelegramInlineKeyboard,
    parseMode?: string,
  ): Promise<TelegramResponse> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
    }

    if (replyMarkup) params.reply_markup = replyMarkup
    if (parseMode) params.parse_mode = parseMode

    return await this.request("editMessageText", params)
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<TelegramResponse> {
    const params: Record<string, unknown> = {
      callback_query_id: callbackQueryId,
    }

    if (text) params.text = text

    return await this.request("answerCallbackQuery", params)
  }

  async setWebhook(url: string, secretToken?: string): Promise<TelegramResponse> {
    const params: Record<string, unknown> = { url }
    if (secretToken) params.secret_token = secretToken
    return await this.request("setWebhook", params)
  }

  async deleteWebhook(): Promise<TelegramResponse> {
    return await this.request("deleteWebhook")
  }

  async getWebhookInfo(): Promise<TelegramResponse> {
    return await this.request("getWebhookInfo")
  }

  // #endregion Core API Methods

  // #region Business Logic Methods (using CQRS)

  /**
   * Get user's accounts display using CQRS
   */
  async getUserAccountsDisplay(userId: number) {
    return await queryBus.execute(new AccountListQuery({ userId }))
  }

  /**
   * Get user's recent transactions using CQRS
   */
  async getUserRecentTransactions(userId: number, limit = 10) {
    return await queryBus.execute(new TransactionListQuery({ userId, limit }))
  }

  /**
   * Get user's categories with usage using CQRS
   */
  async getUserCategoriesWithUsage(userId: number) {
    return await queryBus.execute(new CategoryListQuery({ userId }))
  }

  /**
   * Get user analytics using CQRS
   */
  async getUserAnalytics(userId: number) {
    return await queryBus.execute(new AnalyticsQuery({ userId }))
  }

  /**
   * Get complete user dashboard using CQRS
   */
  async getUserDashboard(userId: number) {
    return await queryBus.execute(new UserDashboardQuery({ userId }))
  }

  // #endregion Business Logic Methods

  // #region Service Access Methods

  /**
   * Access to display formatting service
   */
  get formatter() {
    return this.displayFormatter
  }

  /**
   * Access to session management service
   */
  get session() {
    return this.sessionManager
  }

  /**
   * Access to user utilities service
   */
  get user() {
    return this.userUtils
  }

  /**
   * Access to error handling service
   */
  get error() {
    return this.errorHandler
  }

  // #endregion Service Access Methods

  // #region Private API Request Methods

  private async request(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<TelegramResponse> {
    const maxRetries = 3
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        const response = await this.requestWithCustomTimeout(method, params)

        if (response.ok) {
          return response
        }

        // Handle rate limiting
        if (response.error_code === 429) {
          const retryAfter =
            typeof response.description === "string" && response.description.includes("retry after")
              ? parseInt(response.description.match(/\d+/)?.[0] || "1")
              : 1

          console.log(`Rate limited, retrying after ${retryAfter} seconds...`)
          await sleep(retryAfter * 1000)
          attempt++
          continue
        }

        // Return non-retryable errors immediately
        return response
      } catch (error) {
        attempt++
        if (attempt >= maxRetries) {
          console.error(`Request failed after ${maxRetries} attempts:`, error)
          return {
            ok: false,
            description: error instanceof Error ? error.message : "Unknown error",
            error_code: 0,
          }
        }

        // Wait before retry
        await sleep(1000 * attempt)
      }
    }

    return {
      ok: false,
      description: "Max retries exceeded",
      error_code: 0,
    }
  }

  private async requestWithCustomTimeout(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = 30000,
  ): Promise<TelegramResponse> {
    const url = `${this.baseUrl}/${method}`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Financy-Bot/1.0",
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Telegram API HTTP error ${response.status}:`, errorText)

        try {
          const errorJson = JSON.parse(errorText)
          return {
            ok: false,
            description: errorJson.description || `HTTP ${response.status}: ${response.statusText}`,
            error_code: errorJson.error_code || response.status,
          }
        } catch {
          return {
            ok: false,
            description: `HTTP ${response.status}: ${response.statusText}`,
            error_code: response.status,
          }
        }
      }

      const result = await response.json()
      return result
    } catch (error) {
      console.error(`Telegram API request failed for ${method}:`, error)

      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          description: "Request timeout",
          error_code: 408,
        }
      }

      return {
        ok: false,
        description: error instanceof Error ? error.message : "Network error",
        error_code: 0,
      }
    }
  }

  /**
   * Validate bot configuration and connectivity
   */
  async validateBot(): Promise<{ valid: boolean; error?: string; botInfo?: TelegramUser }> {
    try {
      const response = await this.getMe()

      if (!response.ok) {
        return {
          valid: false,
          error: `Bot validation failed: ${response.description}`,
        }
      }

      if (!response.result?.is_bot) {
        return {
          valid: false,
          error: "Token does not belong to a bot",
        }
      }

      return {
        valid: true,
        botInfo: response.result,
      }
    } catch (error) {
      return {
        valid: false,
        error: `Bot validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  // #endregion Private API Request Methods
}

// Export singleton instance (only if token is provided)
export const telegramBot = config.telegramBotToken ? new TelegramBot(config.telegramBotToken) : null

// Export the class for testing/advanced usage
export { TelegramBot }
