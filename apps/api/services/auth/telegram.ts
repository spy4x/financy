import { SessionMFAStatus, User, UserKeyKind, UserMFAStatus, UserRole } from "@shared/types"
import { db } from "../db.ts"
import { SessionManager } from "./session.ts"
import { AuthData } from "./types.ts"

export class TelegramMethod {
  constructor(private session: SessionManager) {}

  /**
   * Check if user exists and authenticate via Telegram ID
   */
  async check(telegramId: number): Promise<null | AuthData> {
    const key = await db.userKey.findOne({
      kind: UserKeyKind.TELEGRAM_AUTH,
      identification: telegramId.toString(),
    })

    if (!key) {
      return null
    }

    const user = await db.user.findOne({ id: key.userId })
    if (!user) {
      return null
    }

    const session = await this.session.create({
      userId: key.userId,
      keyId: key.id,
      mfa: user.mfa === UserMFAStatus.CONFIGURED
        ? SessionMFAStatus.NOT_PASSED_YET
        : SessionMFAStatus.NOT_REQUIRED,
    })

    if (!session) {
      return null
    }

    return {
      user,
      key,
      session,
    }
  }

  /**
   * Sign up new user with Telegram authentication
   */
  async signUp(
    telegramId: number,
    firstName: string,
    lastName?: string,
  ): Promise<null | AuthData> {
    return db.begin(async (tx) => {
      const existingKey = await tx.userKey.findOne({
        kind: UserKeyKind.TELEGRAM_AUTH,
        identification: telegramId.toString(),
      })

      if (existingKey) { // Telegram ID already registered
        return null
      }

      const user = await tx.user.createOne({
        data: {
          firstName: firstName || "",
          lastName: lastName || "",
          mfa: UserMFAStatus.NOT_CONFIGURED,
          role: UserRole.VIEWER,
          lastLoginAt: new Date(),
        },
      })

      if (!user) {
        console.error("Failed to create user", { telegramId, firstName, lastName })
        return null
      }

      const key = await tx.userKey.createOne({
        userId: user.id,
        kind: UserKeyKind.TELEGRAM_AUTH,
        identification: telegramId.toString(),
        secret: "", // Empty string for Telegram auth
      })

      if (!key) {
        console.error("Failed to create Telegram key", {
          userId: user.id,
          telegramId,
          kind: UserKeyKind.TELEGRAM_AUTH,
        })
        return null
      }

      const session = await this.session.create({
        userId: user.id,
        keyId: key.id,
        mfa: SessionMFAStatus.NOT_REQUIRED,
      }, tx)

      if (!session) {
        console.error("Failed to create session", { userId: user.id, keyId: key.id, telegramId })
        return null
      }

      return { user, key, session }
    })
  }

  /**
   * Connect Telegram auth to existing user
   */
  async connect(userId: number, telegramId: number): Promise<null | AuthData> {
    const existingKey = await db.userKey.findOne({
      kind: UserKeyKind.TELEGRAM_AUTH,
      identification: telegramId.toString(),
    })

    if (existingKey) { // Telegram ID already connected to a user
      return null
    }

    const key = await db.userKey.createOne({
      userId,
      kind: UserKeyKind.TELEGRAM_AUTH,
      identification: telegramId.toString(),
      secret: "", // Empty string for Telegram auth
    })

    if (!key) {
      console.error("Failed to create Telegram key", {
        userId,
        telegramId,
        kind: UserKeyKind.TELEGRAM_AUTH,
      })
      return null
    }

    const user = await db.user.findOne({ id: userId })
    if (!user) {
      console.error("Failed to get user", { userId })
      return null
    }

    const session = await this.session.create({
      userId,
      keyId: key.id,
      mfa: user.mfa === UserMFAStatus.CONFIGURED
        ? SessionMFAStatus.NOT_PASSED_YET
        : SessionMFAStatus.NOT_REQUIRED,
    })

    if (!session) {
      console.error("Failed to create session", { userId, keyId: key.id, telegramId })
      return null
    }

    return {
      user,
      key,
      session,
    }
  }

  /**
   * Find user by Telegram ID without authentication
   */
  async findUserByTelegramId(telegramId: number): Promise<null | User> {
    const key = await db.userKey.findOne({
      kind: UserKeyKind.TELEGRAM_AUTH,
      identification: telegramId.toString(),
    })

    if (!key) {
      return null
    }

    return await db.user.findOne({ id: key.userId })
  }

  /**
   * Check if Telegram ID is already registered
   */
  async isTelegramIdRegistered(telegramId: number): Promise<boolean> {
    const key = await db.userKey.findOne({
      kind: UserKeyKind.TELEGRAM_AUTH,
      identification: telegramId.toString(),
    })

    return !!key
  }

  /**
   * Generate a connection code for linking existing user to Telegram
   * Called from web app profile page
   */
  async generateConnectionCode(userId: number): Promise<
    {
      error: string
      code: null
    } | {
      error: null
      code: string
    }
  > {
    try {
      // Check if user already has Telegram linked
      const existingTelegramKey = await db.userKey.findOne({
        kind: UserKeyKind.TELEGRAM_AUTH,
        userId,
      })

      if (existingTelegramKey) {
        return { error: "Telegram already linked to this account", code: null }
      }

      // Check if there's already a pending connection
      const existingConnectionKey = await db.userKey.findOne({
        kind: UserKeyKind.TELEGRAM_LINKING_CONNECTING,
        userId,
      })

      let connectionCode: string

      if (existingConnectionKey && existingConnectionKey.secret) {
        // Use existing code if it's still valid (within 10 minutes)
        const createdAt = new Date(existingConnectionKey.createdAt)
        const now = new Date()
        const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60)

        if (diffMinutes < 10) {
          connectionCode = existingConnectionKey.secret
        } else {
          // Generate new code and update existing record
          connectionCode = this.generateCode()
          await db.userKey.updateOne({
            id: existingConnectionKey.id,
            data: {
              secret: connectionCode,
              updatedAt: new Date(),
            },
          })
        }
      } else {
        // Generate new connection code
        connectionCode = this.generateCode()

        // Store connection attempt
        await db.userKey.createOne({
          userId,
          kind: UserKeyKind.TELEGRAM_LINKING_CONNECTING,
          identification: `telegram_link_${userId}_${Date.now()}`,
          secret: connectionCode,
        })
      }

      return { error: null, code: connectionCode }
    } catch (error) {
      console.error("Failed to generate connection code:", error)
      return { error: "Failed to generate connection code", code: null }
    }
  }

  /**
   * Complete the linking process when user provides code to Telegram bot
   */
  async completeConnection(telegramId: number, connectionCode: string): Promise<
    {
      error: string
      user: null
    } | {
      error: null
      user: { id: number; firstName: string | null }
    }
  > {
    try {
      // Find pending connection with this code
      // Search through all connecting keys to find the one with matching secret
      const connectionKeys = await db.userKey.findMany({
        kind: UserKeyKind.TELEGRAM_LINKING_CONNECTING,
      })

      const connectionKey = connectionKeys.find((key) => key.secret === connectionCode)

      if (!connectionKey) {
        return { error: "Invalid or expired connection code", user: null }
      }

      // Check if code is still valid (10 minutes)
      const createdAt = new Date(connectionKey.createdAt)
      const now = new Date()
      const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60)

      if (diffMinutes > 10) {
        // Clean up expired code
        await db.userKey.deleteOne({ id: connectionKey.id })
        return { error: "Connection code has expired. Please generate a new one.", user: null }
      }

      const userId = connectionKey.userId

      // Check if user already has Telegram auth
      const existingTelegramKey = await db.userKey.findOne({
        kind: UserKeyKind.TELEGRAM_AUTH,
        userId,
      })

      if (existingTelegramKey) {
        await db.userKey.deleteOne({ id: connectionKey.id })
        return { error: "This account already has Telegram linked", user: null }
      }

      // Check if this Telegram ID is already linked to another account
      const existingTelegramUser = await db.userKey.findOne({
        kind: UserKeyKind.TELEGRAM_AUTH,
        identification: telegramId.toString(),
      })

      if (existingTelegramUser) {
        await db.userKey.deleteOne({ id: connectionKey.id })
        return { error: "This Telegram account is already linked to another user", user: null }
      }

      // Get user info
      const user = await db.user.findOne({ id: userId })
      if (!user) {
        await db.userKey.deleteOne({ id: connectionKey.id })
        return { error: "User not found", user: null }
      }

      // Complete the linking
      await db.begin(async (tx) => {
        // Create Telegram auth key
        await tx.userKey.createOne({
          userId,
          kind: UserKeyKind.TELEGRAM_AUTH,
          identification: telegramId.toString(),
          secret: "", // Empty string for Telegram auth
        })

        // Update connection status
        await tx.userKey.updateOne({
          id: connectionKey.id,
          data: {
            kind: UserKeyKind.TELEGRAM_LINKING_COMPLETED,
          },
        })
      })

      return {
        error: null,
        user: {
          id: user.id,
          firstName: user.firstName,
        },
      }
    } catch (error) {
      console.error("Failed to complete connection:", error)
      return { error: "Failed to complete connection", user: null }
    }
  }

  /**
   * Disconnect Telegram from user account
   */
  async disconnect(userId: number): Promise<boolean> {
    try {
      // Find Telegram auth key for this user
      const telegramKey = await db.userKey.findOne({
        kind: UserKeyKind.TELEGRAM_AUTH,
        userId,
      })

      if (!telegramKey) {
        return false // Not connected
      }

      // Delete the Telegram auth key
      await db.userKey.deleteOne({ id: telegramKey.id })

      return true
    } catch (error) {
      console.error("Failed to disconnect Telegram:", error)
      return false
    }
  }

  /**
   * Generate a 6-character alphanumeric code
   */
  private generateCode(): string {
    const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789" // Removed confusing chars: 0, O, I, L
    let result = ""
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }
}
