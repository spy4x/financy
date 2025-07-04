/**
 * Telegram User Utilities
 * Centralized user validation and authentication helpers
 * Refactored to use auth service instead of deprecated telegram-helper
 */
import { telegramBot } from "@api/services/telegram/+bot.ts"
import { TelegramSessionManager } from "./session-manager.ts"
import { TelegramMethod } from "@api/services/auth/telegram.ts"
import { SessionManager } from "@api/services/auth/session.ts"

export interface ValidatedUser {
  userId: number
}

export class TelegramUserUtils {
  private static telegramAuth = new TelegramMethod(new SessionManager())

  /**
   * Get validated user from Telegram ID
   * Uses TelegramMethod for user operations
   */
  static async getValidatedUser(telegramUserId: number): Promise<ValidatedUser | null> {
    const user = await this.telegramAuth.findUserByTelegramId(telegramUserId)
    if (!user) {
      return null
    }
    return { userId: user.id }
  }

  /**
   * Get validated user from message and send error if not found
   */
  static async getValidatedUserOrSendError(
    chatId: number,
    telegramUserId: number,
  ): Promise<ValidatedUser | null> {
    const session = await TelegramSessionManager.get(chatId)
    if (!session) {
      await telegramBot?.sendMessage(chatId, "❌ Please start with /start first.")
      return null
    }

    const user = await this.telegramAuth.findUserByTelegramId(telegramUserId)
    if (!user) {
      await telegramBot?.sendMessage(
        chatId,
        "❌ User not found. Please start with /start first.",
      )
      return null
    }

    return { userId: user.id }
  }

  /**
   * Check if user exists by Telegram ID
   */
  static async userExists(telegramUserId: number): Promise<boolean> {
    const user = await this.telegramAuth.findUserByTelegramId(telegramUserId)
    return !!user
  }

  /**
   * Find user by Telegram ID (no validation)
   */
  static async findUser(telegramUserId: number) {
    return await this.telegramAuth.findUserByTelegramId(telegramUserId)
  }
}
