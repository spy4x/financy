import { config } from "./config.ts"
import { sleep } from "@shared/helpers/async.ts"

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
  result?: T
  description?: string
  error_code?: number
}

export interface TelegramWebhookInfo {
  url: string
  has_custom_certificate: boolean
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
  max_connections?: number
  allowed_updates?: string[]
}

/**
 * Telegram Bot API client with production-ready features
 * Follow https://core.telegram.org/bots/api for documentation
 */
export class TelegramBot {
  private readonly baseUrl: string
  private readonly maxRetries: number = 3
  private readonly retryDelayMs: number = 1000

  constructor(token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`
  }

  /**
   * Send a message to a chat with automatic retry on failure
   */
  async sendMessage(
    chatId: number,
    text: string,
    options: {
      parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
      reply_markup?: TelegramInlineKeyboard
      disable_web_page_preview?: boolean
      disable_notification?: boolean
    } = {},
  ): Promise<TelegramResponse> {
    // Telegram has a 4096 character limit for messages
    if (text.length > 4096) {
      console.warn(`Message too long (${text.length} chars), truncating`)
      text = text.substring(0, 4093) + "..."
    }

    return await this.requestWithRetry("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true, // Default to prevent accidental previews
      ...options,
    })
  }

  /**
   * Answer callback query (for inline keyboard button presses)
   */
  async answerCallbackQuery(
    callbackQueryId: string,
    options: {
      text?: string
      show_alert?: boolean
      url?: string
      cache_time?: number
    } = {},
  ): Promise<TelegramResponse> {
    return await this.requestWithRetry("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...options,
    })
  }

  /**
   * Edit message text with new inline keyboard
   */
  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: {
      parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
      reply_markup?: TelegramInlineKeyboard
      disable_web_page_preview?: boolean
    } = {},
  ): Promise<TelegramResponse> {
    return await this.requestWithRetry("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
      ...options,
    })
  }

  /**
   * Send an error message with consistent formatting
   */
  async sendErrorMessage(chatId: number, error: string): Promise<TelegramResponse> {
    return await this.sendMessage(chatId, `❌ ${error}`)
  }

  /**
   * Send a success message with consistent formatting
   */
  async sendSuccessMessage(chatId: number, message: string): Promise<TelegramResponse> {
    return await this.sendMessage(chatId, `✅ ${message}`)
  }

  /**
   * Set webhook URL for receiving updates
   */
  async setWebhook(url: string, secretToken?: string): Promise<TelegramResponse> {
    const params: Record<string, unknown> = {
      url: url,
      max_connections: 100, // Reasonable limit for production
      drop_pending_updates: true, // Clear old updates when setting webhook
      allowed_updates: ["message", "callback_query"], // Handle both messages and button presses
    }
    if (secretToken) {
      params.secret_token = secretToken
    }
    return await this.requestWithRetry("setWebhook", params)
  }

  /**
   * Get webhook info with enhanced error reporting
   */
  async getWebhookInfo(): Promise<TelegramResponse<TelegramWebhookInfo>> {
    return await this.requestWithRetry("getWebhookInfo") as TelegramResponse<TelegramWebhookInfo>
  }

  /**
   * Delete webhook (for polling mode)
   */
  async deleteWebhook(): Promise<TelegramResponse> {
    return await this.requestWithRetry("deleteWebhook", {
      drop_pending_updates: true,
    })
  }

  /**
   * Get updates using long polling with robust error handling
   *
   * Note: Long polling is designed to hold connections open for extended periods.
   * In production, use shorter timeouts (5-10s) for faster reconnection on network issues.
   * For development, consider even shorter timeouts (2-5s) for better responsiveness.
   */
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

  /**
   * Get bot information
   */
  async getMe(): Promise<TelegramResponse<TelegramUser>> {
    return await this.requestWithRetry("getMe") as TelegramResponse<TelegramUser>
  }

  /**
   * Make a request with automatic retry logic for production reliability
   */
  private async requestWithRetry(
    method: string,
    params: Record<string, unknown> = {},
    attempt = 1,
  ): Promise<TelegramResponse> {
    try {
      const response = await this.request(method, params)

      // If rate limited, wait and retry
      if (!response.ok && response.error_code === 429) {
        if (attempt <= this.maxRetries) {
          const retryAfter = 1000 // Default 1 second, should parse retry_after from response
          console.warn(
            `Rate limited, retrying after ${retryAfter}ms (attempt ${attempt}/${this.maxRetries})`,
          )
          await sleep(retryAfter)
          return this.requestWithRetry(method, params, attempt + 1)
        }
      }

      // Retry on server errors
      if (!response.ok && response.error_code && response.error_code >= 500) {
        if (attempt <= this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1) // Exponential backoff
          console.warn(
            `Server error ${response.error_code}, retrying after ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
          )
          await sleep(delay)
          return this.requestWithRetry(method, params, attempt + 1)
        }
      }

      return response
    } catch (error) {
      if (attempt <= this.maxRetries) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1)
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.warn(
          `Request failed, retrying after ${delay}ms (attempt ${attempt}/${this.maxRetries}):`,
          errorMessage,
        )
        await sleep(delay)
        return this.requestWithRetry(method, params, attempt + 1)
      }

      return {
        ok: false,
        description: error instanceof Error ? error.message : "Unknown error",
        error_code: 0,
      }
    }
  }

  /**
   * Make a request to Telegram Bot API with production-grade error handling
   */
  private async request(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<TelegramResponse> {
    return this.requestWithCustomTimeout(method, params, 30000) // Default 30 second timeout
  }

  /**
   * Make a request to Telegram Bot API with custom timeout
   */
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
}

// Export singleton instance (only if token is provided)
export const telegramBot = config.telegramBotToken ? new TelegramBot(config.telegramBotToken) : null
