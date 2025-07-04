import type { TelegramInlineKeyboard } from "@api/services/telegram/+bot.ts"
import type { Account } from "@shared/types"

/**
 * Telegram Bot Menu Builder Service
 * Creates standardized inline keyboards for the Financy bot
 */
export class TelegramMenus {
  /**
   * Main menu for authenticated users
   */
  static getMainMenu(): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: "💰 Accounts", callback_data: "menu_accounts" },
          { text: "📊 Recent", callback_data: "menu_recent" },
        ],
        [
          { text: "➕ Add Transaction", callback_data: "menu_add" },
          { text: "📋 Categories", callback_data: "menu_categories" },
        ],
        [
          { text: "📈 Analytics", callback_data: "menu_analytics" },
          { text: "❓ Help", callback_data: "menu_help" },
        ],
      ],
    }
  }

  /**
   * Transaction type selection menu
   */
  static getTransactionTypeMenu(): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: "💸 Expense", callback_data: "tx_type_expense" },
          { text: "💰 Income", callback_data: "tx_type_income" },
        ],
        [
          { text: "🔄 Transfer", callback_data: "tx_type_transfer" },
        ],
        [
          { text: "⬅️ Back", callback_data: "menu_main" },
        ],
      ],
    }
  }

  /**
   * Account selection menu
   */
  static getAccountSelectionMenu(accounts: Account[], prefix: string): TelegramInlineKeyboard {
    const buttons = accounts.map((account) => [{
      text: `💳 ${account.name}`,
      callback_data: `${prefix}_${account.id}`,
    }])

    return {
      inline_keyboard: [
        ...buttons,
        [{ text: "⬅️ Back", callback_data: "menu_add" }],
      ],
    }
  }

  /**
   * Transfer destination account selection menu (excludes the source account)
   */
  static getTransferToAccountMenu(
    accounts: Account[],
    excludeAccountId: number,
  ): TelegramInlineKeyboard {
    const availableAccounts = accounts.filter((account) => account.id !== excludeAccountId)

    const buttons = availableAccounts.map((account) => [{
      text: `💳 ${account.name}`,
      callback_data: `to_account_${account.id}`,
    }])

    return {
      inline_keyboard: [
        ...buttons,
        [{ text: "⬅️ Back", callback_data: "tx_select_account" }],
      ],
    }
  }

  /**
   * Category selection menu
   */
  static getCategorySelectionMenu(
    categories: Array<{ id: number; name: string; icon?: string }>,
    prefix: string,
  ): TelegramInlineKeyboard {
    const buttons = categories.map((category) => [{
      text: `${category.icon || "📂"} ${category.name}`,
      callback_data: `${prefix}_${category.id}`,
    }])

    return {
      inline_keyboard: [
        ...buttons,
        [{ text: "⬅️ Back", callback_data: "tx_select_account" }],
      ],
    }
  }

  /**
   * Cancel/Back menu
   */
  static getCancelMenu(backAction: string): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [{ text: "❌ Cancel", callback_data: "menu_main" }],
        [{ text: "⬅️ Back", callback_data: backAction }],
      ],
    }
  }

  /**
   * Quick actions menu after transaction creation
   */
  static getQuickActionsMenu(): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: "➕ Add Another", callback_data: "menu_add" },
          { text: "📊 View Recent", callback_data: "menu_recent" },
        ],
        [
          { text: "🏠 Main Menu", callback_data: "menu_main" },
        ],
      ],
    }
  }

  /**
   * Back button menu
   */
  static getBackMenu(): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [{ text: "⬅️ Back", callback_data: "menu_main" }],
      ],
    }
  }

  /**
   * Simple OK menu
   */
  static getOkMenu(): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [{ text: "✅ OK", callback_data: "menu_main" }],
      ],
    }
  }
}
