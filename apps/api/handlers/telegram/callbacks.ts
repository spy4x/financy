import type { TelegramCallbackQuery } from "@api/services/telegram-bot.ts"
import { telegramBot } from "@api/services/telegram-bot.ts"
import { TelegramMenus } from "@api/services/telegram-menus.ts"
import { publicAPICache } from "@api/services/cache.ts"
import { db } from "@api/services/db.ts"
import { auth } from "@api/services/auth/+index.ts"
import { TelegramHelper } from "@api/services/telegram-helper.ts"
import { config } from "@api/services/config.ts"
import { CategoryType, TransactionDirection, TransactionType } from "@shared/types"
import { formatTime } from "@shared/helpers/format.ts"

/**
 * Handle inline keyboard callback queries
 */
export async function handleTelegramCallback(callbackQuery: TelegramCallbackQuery): Promise<void> {
  if (!telegramBot || !callbackQuery.data) return

  const chatId = callbackQuery.message?.chat.id
  if (!chatId) return

  const data = callbackQuery.data
  const messageId = callbackQuery.message?.message_id

  // Always answer the callback query to stop the loading spinner
  await telegramBot.answerCallbackQuery(callbackQuery.id)

  try {
    // Get user context
    const userContext = await getValidatedUser(callbackQuery.from.id)
    if (!userContext) {
      await telegramBot.sendMessage(chatId, "❌ Please start with /start first.")
      return
    }

    // Route based on callback data
    if (data.startsWith("menu_")) {
      await handleMenuCallback(chatId, messageId, data, userContext.userId)
    } else if (data.startsWith("tx_")) {
      await handleTransactionCallback(chatId, messageId, data, userContext.userId)
    } else if (data.startsWith("account_")) {
      await handleAccountCallback(chatId, messageId, data, userContext.userId)
    } else if (data.startsWith("category_")) {
      await handleCategoryCallback(chatId, messageId, data, userContext.userId)
    } else if (data === "cancel") {
      await handleCancelCallback(chatId, messageId)
    } else if (data === "noop") {
      // Do nothing for pagination indicators
      return
    }
  } catch (error) {
    console.error("Error handling callback:", error)
    await telegramBot.sendMessage(chatId, "❌ Something went wrong. Please try again.")
  }
}

/**
 * Handle menu navigation callbacks
 */
async function handleMenuCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  switch (data) {
    case "menu_main":
      await showMainMenu(chatId, messageId)
      break
    case "menu_accounts":
      await showAccounts(chatId, messageId, userId)
      break
    case "menu_recent":
      await showRecentTransactions(chatId, messageId, userId)
      break
    case "menu_add":
      await showAddTransactionMenu(chatId, messageId)
      break
    case "menu_categories":
      await showCategories(chatId, messageId, userId)
      break
    case "menu_analytics":
      await showAnalytics(chatId, messageId, userId)
      break
    case "menu_help":
      await showHelp(chatId, messageId)
      break
  }
}

/**
 * Handle transaction-related callbacks
 */
async function handleTransactionCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  if (data === "tx_type_expense" || data === "tx_type_income" || data === "tx_type_transfer") {
    await handleTransactionTypeSelection(chatId, messageId, data, userId)
  } else if (data === "tx_select_account") {
    await showAccountSelection(chatId, messageId, userId)
  } else if (data === "tx_confirm") {
    await confirmTransaction(chatId, messageId, userId)
  } else if (data === "tx_cancel") {
    await cancelTransaction(chatId, messageId)
  }
}

/**
 * Handle account selection callbacks
 */
async function handleAccountCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  const accountId = parseInt(data.replace("account_", ""))
  if (isNaN(accountId)) return

  await selectAccount(chatId, messageId, userId, accountId)
}

/**
 * Handle category selection callbacks
 */
async function handleCategoryCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  const categoryId = parseInt(data.replace("category_", ""))
  if (isNaN(categoryId)) return

  await selectCategory(chatId, messageId, userId, categoryId)
}

/**
 * Handle cancel callback
 */
async function handleCancelCallback(
  chatId: number,
  messageId: number | undefined,
): Promise<void> {
  if (!telegramBot) return

  // Clear any ongoing transaction state
  await publicAPICache.telegramSession.clearState(chatId)

  const text = "✅ Operation cancelled."
  const keyboard = TelegramMenus.getMainMenu()

  if (messageId) {
    await telegramBot.editMessageText(chatId, messageId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } else {
    await telegramBot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }
}

/**
 * Show main menu
 */
async function showMainMenu(chatId: number, messageId?: number): Promise<void> {
  if (!telegramBot) return

  const text = `🏠 *Financy Main Menu*

Welcome! Choose an option below:`

  const keyboard = TelegramMenus.getMainMenu()

  if (messageId) {
    await telegramBot.editMessageText(chatId, messageId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } else {
    await telegramBot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }
}

/**
 * Show accounts with balances
 */
async function showAccounts(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    const { accounts, currencies, formatAccountBalance } = await TelegramHelper
      .getUserAccountsDisplay(userId)

    if (accounts.length === 0) {
      const text = "📭 You don't have any accounts yet.\n\n" +
        `Use the web app to create your first account: ${config.webAppUrl}`

      const keyboard = TelegramMenus.getMainMenu()

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, {
          reply_markup: keyboard,
        })
      } else {
        await telegramBot.sendMessage(chatId, text, {
          reply_markup: keyboard,
        })
      }
      return
    }

    let text = "💰 *Your Accounts*\n\n"

    for (const account of accounts) {
      const formattedBalance = formatAccountBalance(account.id)
      const currency = currencies.get(account.currencyId)

      text += `💳 *${account.name}*\n`
      text += `   Balance: ${formattedBalance}\n`
      text += `   Currency: ${currency?.code || "USD"}\n\n`
    }

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Failed to get accounts:", error)
    const text = "❌ Failed to load accounts. Please try again later."
    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        reply_markup: keyboard,
      })
    }
  }
}

/**
 * Show recent transactions
 */
async function showRecentTransactions(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    const { transactions } = await TelegramHelper.getUserRecentTransactionsDisplay(userId)

    if (transactions.length === 0) {
      const text = "📭 No transactions found.\n\nUse the menu below to add your first transaction!"
      const keyboard = TelegramMenus.getMainMenu()

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, {
          reply_markup: keyboard,
        })
      } else {
        await telegramBot.sendMessage(chatId, text, {
          reply_markup: keyboard,
        })
      }
      return
    }

    let text = "📊 *Recent Transactions*\n\n"

    for (const txn of transactions) {
      const direction = txn.direction === TransactionDirection.MONEY_OUT ? "🔴" : "🟢"
      const typeIcon = txn.type === TransactionType.EXPENSE
        ? "💸"
        : txn.type === TransactionType.INCOME
        ? "💰"
        : "🔄"

      text += `${direction} ${typeIcon} ${txn.formattedAmount}\n`
      text += `   Account: ${txn.accountName}\n`
      if (txn.categoryName) {
        text += `   Category: ${txn.categoryName}\n`
      }
      if (txn.memo) {
        text += `   Note: ${txn.memo}\n`
      }
      text += `   ${formatTime(txn.timestamp)}\n\n`
    }

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Failed to get recent transactions:", error)
    const text = "❌ Failed to load transactions. Please try again later."
    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        reply_markup: keyboard,
      })
    }
  }
}

/**
 * Show add transaction menu
 */
async function showAddTransactionMenu(chatId: number, messageId?: number): Promise<void> {
  if (!telegramBot) return

  const text = `➕ *Add New Transaction*

What type of transaction would you like to add?`

  const keyboard = TelegramMenus.getTransactionTypeMenu()

  if (messageId) {
    await telegramBot.editMessageText(chatId, messageId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } else {
    await telegramBot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }
}

/**
 * Show categories
 */
async function showCategories(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    const { categoriesWithUsage } = await TelegramHelper.getUserCategoriesWithUsage(userId)

    if (categoriesWithUsage.length === 0) {
      const text = "📭 You don't have any categories yet.\n\n" +
        `Use the web app to create your first category: ${config.webAppUrl}`

      const keyboard = TelegramMenus.getMainMenu()

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, {
          reply_markup: keyboard,
        })
      } else {
        await telegramBot.sendMessage(chatId, text, {
          reply_markup: keyboard,
        })
      }
      return
    }

    let text = "📋 *Your Categories*\n\n"

    const expenseCategories = categoriesWithUsage.filter((c) => c.type === CategoryType.EXPENSE)
    const incomeCategories = categoriesWithUsage.filter((c) => c.type === CategoryType.INCOME)

    if (expenseCategories.length > 0) {
      text += "💸 *Expense Categories*\n"
      for (const category of expenseCategories) {
        text += `   ${category.icon || "•"} ${category.name}\n`

        if (category.monthlyLimit && category.monthlyLimit > 0) {
          const usedPercent = Math.round((category.monthlyUsed / category.monthlyLimit) * 100)
          const progressBar = generateProgressBar(usedPercent)

          text +=
            `     💰 ${category.formattedMonthlyUsed} / ${category.formattedMonthlyLimit} (${usedPercent}%)\n`
          text += `     ${progressBar}\n`
        } else {
          text += `     💰 ${category.formattedMonthlyUsed} (no limit)\n`
        }
      }
      text += "\n"
    }

    if (incomeCategories.length > 0) {
      text += "💰 *Income Categories*\n"
      for (const category of incomeCategories) {
        text += `   ${category.icon || "•"} ${category.name}\n`
        text += `     💰 ${category.formattedMonthlyUsed} this month\n`
      }
    }

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Failed to get categories:", error)
    const text = "❌ Failed to load categories. Please try again later."
    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        reply_markup: keyboard,
      })
    }
  }
}

/**
 * Show analytics
 */
async function showAnalytics(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    const analytics = await TelegramHelper.getUserAnalytics(userId)

    let text = "📊 *Financial Analytics*\n\n"

    // Monthly overview
    text += "📅 *This Month*\n"
    text += `💰 Income: ${analytics.formattedIncome}\n`
    text += `💸 Expenses: ${analytics.formattedExpenses}\n`
    text += `📈 Net Flow: ${analytics.formattedNetFlow}\n\n`

    // Top expense categories
    if (analytics.topExpenseCategories.length > 0) {
      text += "🔥 *Top Expense Categories*\n"
      analytics.topExpenseCategories.forEach((category, index) => {
        const emoji = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "  "
        text += `${emoji} ${category.icon || "•"} ${category.name}: ${category.formattedAmount}\n`
      })
      text += "\n"
    }

    // Accounts overview
    if (analytics.accountsOverview.length > 0) {
      text += "💳 *Account Balances*\n"
      analytics.accountsOverview.forEach((account) => {
        const balanceEmoji = account.balance >= 0 ? "🟢" : "🔴"
        text += `${balanceEmoji} ${account.name}: ${account.formattedBalance}\n`
      })
    }

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Failed to get analytics:", error)
    const text = "❌ Failed to load analytics. Please try again later."
    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        reply_markup: keyboard,
      })
    }
  }
}

/**
 * Show help
 */
async function showHelp(chatId: number, messageId?: number): Promise<void> {
  if (!telegramBot) return

  const text = `❓ *Financy Bot Help*

🤖 *Available Features*

💰 *Accounts* - View your account balances
📊 *Recent* - See your latest transactions
➕ *Add Transaction* - Create new expense, income, or transfer
📋 *Categories* - View and manage your spending categories
📈 *Analytics* - Get insights into your financial activity

🔧 *Getting Started*

1. Use the menu buttons below to navigate
2. Follow the step-by-step transaction wizard
3. View real-time balance updates
4. Track your spending patterns

💡 *Tips*

• All data syncs with your web account
• Use the back buttons to navigate between screens
• Cancel any operation with the ❌ button`

  const keyboard = TelegramMenus.getMainMenu()

  if (messageId) {
    await telegramBot.editMessageText(chatId, messageId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  } else {
    await telegramBot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }
}

/**
 * Handle transaction type selection
 */
async function handleTransactionTypeSelection(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  let transactionType: TransactionType
  let emoji: string
  let typeName: string

  switch (data) {
    case "tx_type_expense":
      transactionType = TransactionType.EXPENSE
      emoji = "💸"
      typeName = "Expense"
      break
    case "tx_type_income":
      transactionType = TransactionType.INCOME
      emoji = "💰"
      typeName = "Income"
      break
    case "tx_type_transfer":
      transactionType = TransactionType.TRANSFER
      emoji = "🔄"
      typeName = "Transfer"
      break
    default:
      return
  }

  // Save transaction type in session
  await publicAPICache.telegramSession.update(chatId, {
    state: "add_transaction_account",
    data: { type: transactionType, typeName, emoji },
  })

  await showAccountSelection(
    chatId,
    messageId,
    userId,
    `${emoji} *${typeName} Transaction*

Select the account:`,
  )
}

/**
 * Show account selection
 */
async function showAccountSelection(
  chatId: number,
  messageId: number | undefined,
  userId: number,
  customText?: string,
): Promise<void> {
  if (!telegramBot) return

  try {
    const accounts = await db.account.findMany(userId)

    if (accounts.length === 0) {
      const text = "❌ No accounts found. Please create an account in the web app first."
      const keyboard = TelegramMenus.getMainMenu()

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, {
          reply_markup: keyboard,
        })
      } else {
        await telegramBot.sendMessage(chatId, text, {
          reply_markup: keyboard,
        })
      }
      return
    }

    const text = customText || "💳 *Select Account*"
    const keyboard = TelegramMenus.getAccountSelectionMenu(accounts, "account")

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Failed to get accounts:", error)
    const text = "❌ Failed to load accounts. Please try again later."
    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        reply_markup: keyboard,
      })
    }
  }
}

/**
 * Select account and proceed to next step
 */
async function selectAccount(
  chatId: number,
  messageId: number | undefined,
  userId: number,
  accountId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    const accounts = await db.account.findMany(userId)
    const selectedAccount = accounts.find((a) => a.id === accountId)

    if (!selectedAccount) {
      await telegramBot.sendMessage(chatId, "❌ Invalid account selection.")
      return
    }

    // Get current session data
    const session = await publicAPICache.telegramSession.get(chatId)
    const sessionData = session?.data || {}

    // Update session with account selection
    const updatedData = {
      ...sessionData,
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
    }

    const transactionType = sessionData.type as TransactionType

    if (transactionType === TransactionType.TRANSFER) {
      // For transfers, ask for amount directly (skip category)
      await publicAPICache.telegramSession.update(chatId, {
        state: "add_transaction_amount",
        data: updatedData,
      })

      const text = `🔄 *Transfer from ${selectedAccount.name}*

Please enter the amount to transfer:

Example: 50.00 or 100`

      const keyboard = TelegramMenus.getCancelMenu("menu_add")

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        })
      } else {
        await telegramBot.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        })
      }
    } else {
      // For expenses/income, select category next
      await publicAPICache.telegramSession.update(chatId, {
        state: "add_transaction_category",
        data: updatedData,
      })

      await showCategorySelection(chatId, messageId, userId, transactionType, selectedAccount.name)
    }
  } catch (error) {
    console.error("Failed to select account:", error)
    await telegramBot.sendMessage(chatId, "❌ Failed to select account. Please try again.")
  }
}

/**
 * Show category selection
 */
async function showCategorySelection(
  chatId: number,
  messageId: number | undefined,
  userId: number,
  transactionType: TransactionType,
  accountName: string,
): Promise<void> {
  if (!telegramBot) return

  try {
    const categories = await db.category.findMany(userId)
    const filteredCategories = categories.filter((c) =>
      c.type ===
        (transactionType === TransactionType.EXPENSE ? CategoryType.EXPENSE : CategoryType.INCOME)
    )

    if (filteredCategories.length === 0) {
      const typeName = transactionType === TransactionType.EXPENSE ? "expense" : "income"
      const text =
        `❌ No ${typeName} categories found. Please create a category in the web app first.`
      const keyboard = TelegramMenus.getMainMenu()

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, {
          reply_markup: keyboard,
        })
      } else {
        await telegramBot.sendMessage(chatId, text, {
          reply_markup: keyboard,
        })
      }
      return
    }

    const emoji = transactionType === TransactionType.EXPENSE ? "💸" : "💰"
    const typeName = transactionType === TransactionType.EXPENSE ? "Expense" : "Income"

    const text = `${emoji} *${typeName} - ${accountName}*

Select a category:`

    const keyboard = TelegramMenus.getCategorySelectionMenu(
      filteredCategories.map((c) => ({ id: c.id, name: c.name, icon: c.icon || undefined })),
      "category",
    )

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Failed to get categories:", error)
    const text = "❌ Failed to load categories. Please try again later."
    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        reply_markup: keyboard,
      })
    }
  }
}

/**
 * Select category and proceed to amount entry
 */
async function selectCategory(
  chatId: number,
  messageId: number | undefined,
  userId: number,
  categoryId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    const categories = await db.category.findMany(userId)
    const selectedCategory = categories.find((c) => c.id === categoryId)

    if (!selectedCategory) {
      await telegramBot.sendMessage(chatId, "❌ Invalid category selection.")
      return
    }

    // Get current session data
    const session = await publicAPICache.telegramSession.get(chatId)
    const sessionData = session?.data || {}

    // Update session with category selection
    await publicAPICache.telegramSession.update(chatId, {
      state: "add_transaction_amount",
      data: {
        ...sessionData,
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
      },
    })

    const text = `${sessionData.emoji} *${sessionData.typeName} - ${sessionData.accountName}*
📂 Category: ${selectedCategory.icon || "•"} ${selectedCategory.name}

Please enter the amount:

Example: 50.00 or 100`

    const keyboard = TelegramMenus.getCancelMenu("tx_select_account")

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    } else {
      await telegramBot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      })
    }
  } catch (error) {
    console.error("Failed to select category:", error)
    await telegramBot.sendMessage(chatId, "❌ Failed to select category. Please try again.")
  }
}

/**
 * Placeholder functions for transaction confirmation
 * These will be implemented when we handle text input for amounts
 */
async function confirmTransaction(
  _chatId: number,
  _messageId: number | undefined,
  _userId: number,
): Promise<void> {
  // Will be implemented with amount handling
}

async function cancelTransaction(chatId: number, messageId: number | undefined): Promise<void> {
  await handleCancelCallback(chatId, messageId)
}

/**
 * Get user context (similar to commands.ts)
 */
async function getValidatedUser(telegramUserId: number): Promise<{ userId: number } | null> {
  const user = await auth.findUserByTelegramId(telegramUserId)
  if (!user) {
    return null
  }
  return { userId: user.id }
}

/**
 * Generate progress bar for monthly limits
 */
function generateProgressBar(percent: number): string {
  const bars = 10
  const filled = Math.round((percent / 100) * bars)
  const empty = bars - filled

  let bar = ""
  for (let i = 0; i < filled; i++) {
    bar += "█"
  }
  for (let i = 0; i < empty; i++) {
    bar += "░"
  }

  // Add warning emoji if over limit
  if (percent > 100) {
    bar += " ⚠️"
  } else if (percent > 80) {
    bar += " ⚡"
  }

  return bar
}
