/**
 * Telegram Error Handler
 * Centralized error handling and user-friendly error messages
 */
import { telegramBot } from "@api/services/telegram/+bot.ts"
import { TelegramMenus } from "@api/services/telegram/+menus.ts"
import { config } from "@api/services/config.ts"

export interface TelegramError {
  type:
    | "NO_ACCOUNTS"
    | "NO_CATEGORIES"
    | "NO_GROUPS"
    | "INVALID_INPUT"
    | "SYSTEM_ERROR"
    | "SESSION_EXPIRED"
    | "USER_NOT_FOUND"
  message?: string
  showMainMenu?: boolean
}

export class TelegramErrorHandler {
  /**
   * Handle common errors with consistent messaging
   */
  static async handleError(
    chatId: number,
    error: TelegramError,
    messageId?: number,
  ): Promise<void> {
    if (!telegramBot) return

    const { message, showMainMenu = true } = this.getErrorDetails(error)
    const keyboard = showMainMenu ? TelegramMenus.getMainMenu() : undefined

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, message, keyboard)
    } else {
      await telegramBot.sendMessage(chatId, message, keyboard)
    }
  }

  /**
   * Handle system errors with logging
   */
  static async handleSystemError(
    chatId: number,
    error: unknown,
    context: string,
    messageId?: number,
  ): Promise<void> {
    console.error(`Telegram ${context} error:`, error)

    await this.handleError(chatId, {
      type: "SYSTEM_ERROR",
      message: `❌ Something went wrong while ${context}. Please try again later.`,
    }, messageId)
  }

  /**
   * Send authentication error
   */
  static async handleAuthError(chatId: number): Promise<void> {
    await this.handleError(chatId, {
      type: "USER_NOT_FOUND",
      showMainMenu: false,
    })
  }

  /**
   * Send session expired error
   */
  static async handleSessionExpired(chatId: number): Promise<void> {
    await this.handleError(chatId, {
      type: "SESSION_EXPIRED",
      showMainMenu: false,
    })
  }

  /**
   * Send no accounts error
   */
  static async handleNoAccounts(chatId: number, messageId?: number): Promise<void> {
    await this.handleError(chatId, {
      type: "NO_ACCOUNTS",
    }, messageId)
  }

  /**
   * Send no categories error
   */
  static async handleNoCategories(
    chatId: number,
    categoryType: string,
    messageId?: number,
  ): Promise<void> {
    await this.handleError(chatId, {
      type: "NO_CATEGORIES",
      message:
        `❌ No ${categoryType} categories found. Please create a category in the web app first.\n\n` +
        `Web app: ${config.webAppUrl}`,
    }, messageId)
  }

  /**
   * Send no groups error
   */
  static async handleNoGroups(chatId: number, messageId?: number): Promise<void> {
    await this.handleError(chatId, {
      type: "NO_GROUPS",
    }, messageId)
  }

  /**
   * Send invalid input error
   */
  static async handleInvalidInput(
    chatId: number,
    expectedInput: string,
    example?: string,
  ): Promise<void> {
    let message = `❌ ${expectedInput}`
    if (example) {
      message += `\n\nExample: ${example}`
    }
    message += "\n\nType /cancel to abort."

    await telegramBot?.sendMessage(chatId, message)
  }

  /**
   * Get error details for different error types
   */
  private static getErrorDetails(error: TelegramError): { message: string; showMainMenu: boolean } {
    if (error.message) {
      return { message: error.message, showMainMenu: error.showMainMenu ?? true }
    }

    switch (error.type) {
      case "NO_ACCOUNTS":
        return {
          message: "📭 You don't have any accounts yet.\n\n" +
            `Use the web app to create your first account: ${config.webAppUrl}`,
          showMainMenu: true,
        }

      case "NO_CATEGORIES":
        return {
          message: "📭 You don't have any categories yet.\n\n" +
            `Use the web app to create your first category: ${config.webAppUrl}`,
          showMainMenu: true,
        }

      case "NO_GROUPS":
        return {
          message: "❌ No groups found. Please create a group in the web app first.\n\n" +
            `Web app: ${config.webAppUrl}`,
          showMainMenu: true,
        }

      case "SESSION_EXPIRED":
        return {
          message: "❌ Session expired. Please start with /start first.",
          showMainMenu: false,
        }

      case "USER_NOT_FOUND":
        return {
          message: "❌ User not found. Please start with /start first.",
          showMainMenu: false,
        }

      case "INVALID_INPUT":
        return {
          message: "❌ Invalid input. Please try again or type /cancel to abort.",
          showMainMenu: false,
        }

      case "SYSTEM_ERROR":
        return {
          message: "❌ Something went wrong. Please try again later.",
          showMainMenu: true,
        }

      default:
        return {
          message: "❌ An unexpected error occurred. Please try again.",
          showMainMenu: true,
        }
    }
  }
}
