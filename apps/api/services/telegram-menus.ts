import type { TelegramInlineKeyboard } from "@api/services/telegram-bot.ts"

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
          { text: "🔙 Back to Menu", callback_data: "menu_main" },
        ],
      ],
    }
  }

  /**
   * Account selection menu (dynamic based on user accounts)
   */
  static getAccountSelectionMenu(
    accounts: Array<{ id: number; name: string }>,
    prefix: string = "account",
  ): TelegramInlineKeyboard {
    const buttons = accounts.map((account, index) => ({
      text: `${index + 1}️⃣ ${account.name}`,
      callback_data: `${prefix}_${account.id}`,
    }))

    // Split into rows of 2
    const rows = []
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2))
    }

    // Add back button
    rows.push([{ text: "🔙 Back", callback_data: "menu_add" }])

    return { inline_keyboard: rows }
  }

  /**
   * Category selection menu (dynamic based on user categories)
   */
  static getCategorySelectionMenu(
    categories: Array<{ id: number; name: string; icon?: string }>,
    prefix: string = "category",
  ): TelegramInlineKeyboard {
    const buttons = categories.map((category, index) => ({
      text: `${index + 1}️⃣ ${category.icon || "•"} ${category.name}`,
      callback_data: `${prefix}_${category.id}`,
    }))

    // Split into rows of 2
    const rows = []
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2))
    }

    // Add back button
    rows.push([{ text: "🔙 Back", callback_data: "tx_select_account" }])

    return { inline_keyboard: rows }
  }

  /**
   * Confirmation menu for transaction creation
   */
  static getTransactionConfirmMenu(): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: "✅ Confirm", callback_data: "tx_confirm" },
          { text: "❌ Cancel", callback_data: "tx_cancel" },
        ],
        [
          { text: "📝 Edit Memo", callback_data: "tx_edit_memo" },
        ],
      ],
    }
  }

  /**
   * Quick actions menu after completing a transaction
   */
  static getQuickActionsMenu(): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: "➕ Add Another", callback_data: "menu_add" },
          { text: "📊 Recent", callback_data: "menu_recent" },
        ],
        [
          { text: "💰 Accounts", callback_data: "menu_accounts" },
          { text: "🏠 Main Menu", callback_data: "menu_main" },
        ],
      ],
    }
  }

  /**
   * Pagination menu for lists
   */
  static getPaginationMenu(
    currentPage: number,
    totalPages: number,
    baseCallback: string,
  ): TelegramInlineKeyboard {
    const buttons = []

    if (totalPages > 1) {
      const row = []

      // Previous page button
      if (currentPage > 1) {
        row.push({ text: "⬅️ Previous", callback_data: `${baseCallback}_page_${currentPage - 1}` })
      }

      // Page indicator
      row.push({ text: `${currentPage}/${totalPages}`, callback_data: "noop" })

      // Next page button
      if (currentPage < totalPages) {
        row.push({ text: "Next ➡️", callback_data: `${baseCallback}_page_${currentPage + 1}` })
      }

      buttons.push(row)
    }

    // Back to main menu
    buttons.push([{ text: "🏠 Main Menu", callback_data: "menu_main" }])

    return { inline_keyboard: buttons }
  }

  /**
   * Cancel/Back menu for any operation
   */
  static getCancelMenu(backCallback: string = "menu_main"): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: "❌ Cancel", callback_data: "cancel" },
          { text: "🔙 Back", callback_data: backCallback },
        ],
      ],
    }
  }

  /**
   * Amount input confirmation menu
   */
  static getAmountConfirmMenu(amount: string): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: `✅ Confirm $${amount}`, callback_data: "tx_confirm_amount" },
        ],
        [
          { text: "✏️ Enter Different Amount", callback_data: "tx_edit_amount" },
          { text: "❌ Cancel", callback_data: "tx_cancel" },
        ],
      ],
    }
  }

  /**
   * Skip/Continue menu for optional fields
   */
  static getSkipMenu(skipCallback: string, continueCallback: string): TelegramInlineKeyboard {
    return {
      inline_keyboard: [
        [
          { text: "⏭️ Skip", callback_data: skipCallback },
          { text: "✏️ Enter", callback_data: continueCallback },
        ],
        [
          { text: "❌ Cancel", callback_data: "tx_cancel" },
        ],
      ],
    }
  }
}
