/**
 * Telegram Session Manager
 * Centralized session state management for Telegram bot
 */
import { publicAPICache } from "@api/services/cache.ts"
import { TransactionType } from "@shared/types"

export interface TelegramSessionData {
  state?: string
  data?: {
    type?: TransactionType
    typeName?: string
    emoji?: string
    accountId?: number
    accountName?: string
    toAccountId?: number // For transfers - destination account
    toAccountName?: string // For transfers - destination account name
    categoryId?: number
    categoryName?: string
    amount?: number
    formattedAmount?: string
    memo?: string
    [key: string]: unknown
  }
}

export class TelegramSessionManager {
  /**
   * Get session data for a chat
   */
  static async get(chatId: number): Promise<TelegramSessionData | null> {
    return await publicAPICache.telegramSession.get(chatId)
  }

  /**
   * Update session data
   */
  static async update(chatId: number, sessionData: TelegramSessionData): Promise<void> {
    await publicAPICache.telegramSession.update(chatId, sessionData)
  }

  /**
   * Set initial session
   */
  static async set(chatId: number): Promise<void> {
    await publicAPICache.telegramSession.set(chatId)
  }

  /**
   * Clear session state (keep session but clear transaction data)
   */
  static async clearState(chatId: number): Promise<void> {
    await publicAPICache.telegramSession.clearState(chatId)
  }

  /**
   * Start transaction creation flow
   */
  static async startTransactionFlow(
    chatId: number,
    type: TransactionType,
    typeName: string,
    emoji: string,
  ): Promise<void> {
    await this.update(chatId, {
      state: "add_transaction_account",
      data: { type, typeName, emoji },
    })
  }

  /**
   * Set account for transaction
   */
  static async setTransactionAccount(
    chatId: number,
    accountId: number,
    accountName: string,
  ): Promise<void> {
    const session = await this.get(chatId)
    if (!session) return

    const type = session.data?.type
    const nextState = type === TransactionType.TRANSFER
      ? "add_transaction_to_account"
      : "add_transaction_category"

    await this.update(chatId, {
      state: nextState,
      data: {
        ...session.data,
        accountId,
        accountName,
      },
    })
  }

  /**
   * Set destination account for transfer
   */
  static async setTransactionToAccount(
    chatId: number,
    toAccountId: number,
    toAccountName: string,
  ): Promise<void> {
    const session = await this.get(chatId)
    if (!session) return

    await this.update(chatId, {
      state: "add_transaction_amount",
      data: {
        ...session.data,
        toAccountId,
        toAccountName,
      },
    })
  }

  /**
   * Set category for transaction
   */
  static async setTransactionCategory(
    chatId: number,
    categoryId: number,
    categoryName: string,
  ): Promise<void> {
    const session = await this.get(chatId)
    if (!session) return

    await this.update(chatId, {
      state: "add_transaction_amount",
      data: {
        ...session.data,
        categoryId,
        categoryName,
      },
    })
  }

  /**
   * Set amount for transaction
   */
  static async setTransactionAmount(
    chatId: number,
    amount: number,
    formattedAmount: string,
  ): Promise<void> {
    const session = await this.get(chatId)
    if (!session) return

    await this.update(chatId, {
      state: "add_transaction_memo",
      data: {
        ...session.data,
        amount,
        formattedAmount,
      },
    })
  }

  /**
   * Set memo for transaction and mark as ready
   */
  static async setTransactionMemo(
    chatId: number,
    memo: string,
  ): Promise<void> {
    const session = await this.get(chatId)
    if (!session) return

    await this.update(chatId, {
      state: "add_transaction_ready",
      data: {
        ...session.data,
        memo,
      },
    })
  }

  /**
   * Check if session is in transaction flow
   */
  static isInTransactionFlow(session: TelegramSessionData | null): boolean {
    return session?.state?.startsWith("add_transaction") || false
  }

  /**
   * Get current transaction step
   */
  static getTransactionStep(session: TelegramSessionData | null): string | null {
    if (!this.isInTransactionFlow(session)) return null
    return session?.state?.replace("add_transaction_", "") || null
  }
}
