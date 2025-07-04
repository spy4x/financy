import type { TelegramMessage } from "@api/services/telegram-bot.ts"
import { telegramBot } from "@api/services/telegram-bot.ts"
import { db } from "@api/services/db.ts"
import { TelegramHelper } from "@api/services/telegram-helper.ts"
import { TelegramMenus } from "@api/services/telegram-menus.ts"
import { publicAPICache } from "@api/services/cache.ts"
import { config } from "@api/services/config.ts"
import {
  CategoryType,
  TransactionDirection,
  TransactionType,
  TransactionUtils,
} from "@shared/types"
import { auth } from "@api/services/auth/+index.ts"
import { formatTime } from "@shared/helpers/format.ts"

/**
 * Helper function to get user and validate session
 */
async function getValidatedUser(message: TelegramMessage): Promise<{ userId: number } | null> {
  const session = await publicAPICache.telegramSession.get(message.chat.id)
  if (!session) {
    await telegramBot?.sendMessage(message.chat.id, "❌ Please start with /start first.")
    return null
  }

  const user = await auth.findUserByTelegramId(message.from?.id || 0)
  if (!user) {
    await telegramBot?.sendMessage(
      message.chat.id,
      "❌ User not found. Please start with /start first.",
    )
    return null
  }

  return { userId: user.id }
}

/**
 * Handle /start command and authentication
 */
export async function handleTelegramStart(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const chatId = message.chat.id
  const telegramUser = message.from

  if (!telegramUser) {
    await telegramBot.sendMessage(chatId, "❌ Unable to identify user.")
    return
  }

  // Check if user is already authenticated
  const user = await TelegramHelper.findUserByTelegramId(telegramUser.id)

  if (user) {
    // User already exists and is linked
    await telegramBot.sendMessage(
      chatId,
      `👋 Welcome back, ${user.firstName}!\n\n` +
        `Your Telegram is already connected to your Financy account.\n\n` +
        `Use the menu below to get started:`,
      {
        parse_mode: "Markdown",
        reply_markup: TelegramMenus.getMainMenu(),
      },
    )

    // Create/refresh session
    await publicAPICache.telegramSession.set(chatId)
    return
  }

  // User doesn't exist - guide them to link existing account
  await telegramBot.sendMessage(
    chatId,
    `👋 Welcome to Financy!\n\n` +
      `I can help you manage your finances through Telegram, but you'll need a Financy account first.\n\n` +
      `**To get started:**\n\n` +
      `1. 🌐 Visit: ${config.webAppUrl}\n` +
      `2. 📝 Create your account and set up accounts/categories\n` +
      `3. 👤 Go to Profile page\n` +
      `4. 📱 Click "Connect Telegram" to get a code\n` +
      `5. � Use \`/link CODE\` here to connect\n\n` +
      `💡 Once connected, you can view balances, add transactions, and more directly in Telegram!\n\n` +
      `❓ Type /help for available commands.`,
    { parse_mode: "Markdown" },
  )
}

/**
 * Handle /help command
 */
export async function handleTelegramHelp(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const helpText = `❓ *Financy Bot Help*

🤖 *Available Features*

💰 *Accounts* - View your account balances
� *Recent* - See your latest transactions  
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
• Cancel any operation with the ❌ button

**Quick Commands:**
/start - Show main menu
/help - Show this help message
/cancel - Cancel current operation`

  await telegramBot.sendMessage(message.chat.id, helpText, {
    parse_mode: "Markdown",
    reply_markup: TelegramMenus.getMainMenu(),
  })
}

/**
 * Handle /accounts command
 */
export async function handleTelegramAccounts(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const userContext = await getValidatedUser(message)
  if (!userContext) return

  try {
    const { accounts, currencies, formatAccountBalance } = await TelegramHelper
      .getUserAccountsDisplay(
        userContext.userId,
      )

    if (accounts.length === 0) {
      await telegramBot.sendMessage(
        message.chat.id,
        "📭 You don't have any accounts yet.\n\n" +
          `Use the web app to create your first account: ${config.webAppUrl}`,
      )
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

    await telegramBot.sendMessage(message.chat.id, text, {
      parse_mode: "Markdown",
      reply_markup: TelegramMenus.getMainMenu(),
    })
  } catch (error) {
    console.error("Failed to get accounts:", error)
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Failed to load accounts. Please try again later.",
    )
  }
}

/**
 * Handle /categories command
 */
export async function handleTelegramCategories(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const userContext = await getValidatedUser(message)
  if (!userContext) return

  try {
    const { categoriesWithUsage } = await TelegramHelper.getUserCategoriesWithUsage(
      userContext.userId,
    )

    if (categoriesWithUsage.length === 0) {
      await telegramBot.sendMessage(
        message.chat.id,
        "📭 You don't have any categories yet.\n\n" +
          `Use the web app to create your first category: ${config.webAppUrl}`,
      )
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

    await telegramBot.sendMessage(message.chat.id, text, {
      parse_mode: "Markdown",
    })
  } catch (error) {
    console.error("Failed to get categories:", error)
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Failed to load categories. Please try again later.",
    )
  }
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

/**
 * Handle /analytics command
 */
export async function handleTelegramAnalytics(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const userContext = await getValidatedUser(message)
  if (!userContext) return

  try {
    const analytics = await TelegramHelper.getUserAnalytics(userContext.userId)

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

    await telegramBot.sendMessage(message.chat.id, text, {
      parse_mode: "Markdown",
    })
  } catch (error) {
    console.error("Failed to get analytics:", error)
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Failed to load analytics. Please try again later.",
    )
  }
}

/**
 * Handle /recent command
 */
export async function handleTelegramRecent(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const userContext = await getValidatedUser(message)
  if (!userContext) return

  try {
    const { transactions } = await TelegramHelper.getUserRecentTransactionsDisplay(
      userContext.userId,
    )

    if (transactions.length === 0) {
      await telegramBot.sendMessage(
        message.chat.id,
        "📭 No transactions found.\n\n" +
          "Use /add to create your first transaction!",
      )
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

    await telegramBot.sendMessage(message.chat.id, text, {
      parse_mode: "Markdown",
    })
  } catch (error) {
    console.error("Failed to get recent transactions:", error)
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Failed to load transactions. Please try again later.",
    )
  }
}

/**
 * Handle /add command (start transaction creation flow)
 */
export async function handleTelegramAdd(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const userContext = await getValidatedUser(message)
  if (!userContext) return

  try {
    const accounts = await db.account.findMany(userContext.userId)

    if (accounts.length === 0) {
      await telegramBot.sendMessage(
        message.chat.id,
        "📭 You don't have any accounts yet.\n\n" +
          `Use the web app to create your first account: ${config.webAppUrl}`,
        {
          reply_markup: TelegramMenus.getMainMenu(),
        },
      )
      return
    }

    // Start transaction creation flow with menu
    await telegramBot.sendMessage(
      message.chat.id,
      `➕ *Add New Transaction*

What type of transaction would you like to add?`,
      {
        parse_mode: "Markdown",
        reply_markup: TelegramMenus.getTransactionTypeMenu(),
      },
    )
  } catch (error) {
    console.error("Failed to start add transaction flow:", error)
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Failed to start transaction creation. Please try again later.",
    )
  }
}

/**
 * Handle /cancel command
 */
export async function handleTelegramCancel(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  await publicAPICache.telegramSession.clearState(message.chat.id)
  await telegramBot.sendMessage(
    message.chat.id,
    "✅ Operation cancelled.",
    {
      reply_markup: TelegramMenus.getMainMenu(),
    },
  )
}

/**
 * Handle text messages (for conversation flows)
 */
export async function handleTelegramText(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const session = await publicAPICache.telegramSession.get(message.chat.id)
  if (!session) {
    await telegramBot.sendMessage(message.chat.id, "❌ Please start with /start first.")
    return
  }

  const userContext = await getValidatedUser(message)
  if (!userContext) return

  const text = message.text?.trim()
  if (!text) return

  try {
    // Handle transaction creation flow
    if (session.state?.startsWith("add_transaction")) {
      await handleTransactionCreationFlow(message, session, userContext.userId, text)
      return
    }

    // Default: show help for any unrecognized text
    await telegramBot.sendMessage(
      message.chat.id,
      "❓ I don't understand. Use the menu below to navigate:",
      {
        reply_markup: TelegramMenus.getMainMenu(),
      },
    )
  } catch (error) {
    console.error("Failed to handle text message:", error)
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Something went wrong. Type /cancel to reset or /help for commands.",
    )
  }
}

/**
 * Handle transaction creation wizard flow
 */
async function handleTransactionCreationFlow(
  message: TelegramMessage,
  session: { state?: string; data?: Record<string, unknown> },
  userId: number,
  text: string,
): Promise<void> {
  if (!telegramBot) return

  const data = session.data || {}

  switch (session.state) {
    case "add_transaction_type":
      await handleTransactionTypeStep(message, userId, text)
      break
    case "add_transaction_account":
      await handleTransactionAccountStep(message, userId, text, data)
      break
    case "add_transaction_category":
      await handleTransactionCategoryStep(message, userId, text, data)
      break
    case "add_transaction_amount":
      await handleTransactionAmountStep(message, userId, text, data)
      break
    case "add_transaction_memo":
      await handleTransactionMemoStep(message, userId, text, data)
      break
    default:
      await telegramBot.sendMessage(
        message.chat.id,
        "❓ I don't understand this step. Type /cancel to start over.",
      )
  }
}

/**
 * Handle transaction type selection
 */
async function handleTransactionTypeStep(
  message: TelegramMessage,
  userId: number,
  text: string,
): Promise<void> {
  if (!telegramBot) return

  let transactionType: TransactionType
  let emoji: string
  let typeName: string

  switch (text) {
    case "1":
      transactionType = TransactionType.EXPENSE
      emoji = "💸"
      typeName = "Expense"
      break
    case "2":
      transactionType = TransactionType.INCOME
      emoji = "💰"
      typeName = "Income"
      break
    case "3":
      transactionType = TransactionType.TRANSFER
      emoji = "🔄"
      typeName = "Transfer"
      break
    default:
      await telegramBot.sendMessage(
        message.chat.id,
        "❌ Please select a valid option (1, 2, or 3) or type /cancel to abort.",
      )
      return
  }

  // Get user accounts
  const accounts = await db.account.findMany(userId)

  if (accounts.length === 0) {
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ No accounts found. Please create an account in the web app first.",
    )
    return
  }

  await publicAPICache.telegramSession.update(message.chat.id, {
    state: "add_transaction_account",
    data: { type: transactionType, typeName, emoji },
  })

  let text_response = `${emoji} *${typeName} Transaction*\n\n`
  text_response += "Select an account:\n\n"

  accounts.forEach((account, index) => {
    text_response += `${index + 1}️⃣ ${account.name}\n`
  })

  text_response += "\nReply with the account number or type /cancel to abort."

  await telegramBot.sendMessage(message.chat.id, text_response, {
    parse_mode: "Markdown",
  })
}

/**
 * Handle account selection
 */
async function handleTransactionAccountStep(
  message: TelegramMessage,
  userId: number,
  text: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!telegramBot) return

  const accounts = await db.account.findMany(userId)
  const accountIndex = parseInt(text) - 1

  if (isNaN(accountIndex) || accountIndex < 0 || accountIndex >= accounts.length) {
    await telegramBot.sendMessage(
      message.chat.id,
      `❌ Please select a valid account number (1-${accounts.length}) or type /cancel to abort.`,
    )
    return
  }

  const selectedAccount = accounts[accountIndex]
  const transactionType = data.type as TransactionType

  // Update session data
  const updatedData = {
    ...data,
    accountId: selectedAccount.id,
    accountName: selectedAccount.name,
  }

  if (transactionType === TransactionType.TRANSFER) {
    // For transfers, we need to select destination account
    await publicAPICache.telegramSession.update(message.chat.id, {
      state: "add_transaction_amount", // Skip category for transfers
      data: updatedData,
    })

    await telegramBot.sendMessage(
      message.chat.id,
      `🔄 *Transfer from ${selectedAccount.name}*\n\n` +
        "Enter the amount to transfer:\n\n" +
        "Example: 50.00 or 100\n\n" +
        "Type /cancel to abort.",
      { parse_mode: "Markdown" },
    )
  } else {
    // For expenses/income, select category
    const categories = await db.category.findMany(userId)
    const filteredCategories = categories.filter((c) =>
      c.type === (
        transactionType === TransactionType.EXPENSE ? CategoryType.EXPENSE : CategoryType.INCOME
      )
    )

    if (filteredCategories.length === 0) {
      await telegramBot.sendMessage(
        message.chat.id,
        `❌ No ${data.typeName?.toString().toLowerCase()} categories found. Please create a category in the web app first.`,
      )
      return
    }

    await publicAPICache.telegramSession.update(message.chat.id, {
      state: "add_transaction_category",
      data: updatedData,
    })

    let text_response = `${data.emoji} *${data.typeName} - ${selectedAccount.name}*\n\n`
    text_response += "Select a category:\n\n"

    filteredCategories.forEach((category, index) => {
      text_response += `${index + 1}️⃣ ${category.icon || "•"} ${category.name}\n`
    })

    text_response += "\nReply with the category number or type /cancel to abort."

    await telegramBot.sendMessage(message.chat.id, text_response, {
      parse_mode: "Markdown",
    })
  }
}

/**
 * Handle category selection
 */
async function handleTransactionCategoryStep(
  message: TelegramMessage,
  userId: number,
  text: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!telegramBot) return

  const categories = await db.category.findMany(userId)
  const transactionType = data.type as TransactionType
  const filteredCategories = categories.filter((c) =>
    c.type === (
      transactionType === TransactionType.EXPENSE ? CategoryType.EXPENSE : CategoryType.INCOME
    )
  )

  const categoryIndex = parseInt(text) - 1

  if (isNaN(categoryIndex) || categoryIndex < 0 || categoryIndex >= filteredCategories.length) {
    await telegramBot.sendMessage(
      message.chat.id,
      `❌ Please select a valid category number (1-${filteredCategories.length}) or type /cancel to abort.`,
    )
    return
  }

  const selectedCategory = filteredCategories[categoryIndex]

  await publicAPICache.telegramSession.update(message.chat.id, {
    state: "add_transaction_amount",
    data: {
      ...data,
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
    },
  })

  await telegramBot.sendMessage(
    message.chat.id,
    `${data.emoji} *${data.typeName} - ${data.accountName}*\n` +
      `📂 Category: ${selectedCategory.icon || "•"} ${selectedCategory.name}\n\n` +
      "Enter the amount:\n\n" +
      "Example: 50.00 or 100\n\n" +
      "Type /cancel to abort.",
    { parse_mode: "Markdown" },
  )
}

/**
 * Handle amount entry
 */
async function handleTransactionAmountStep(
  message: TelegramMessage,
  _userId: number,
  text: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!telegramBot) return

  const amount = parseFloat(text)

  if (isNaN(amount) || amount <= 0) {
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Please enter a valid positive amount (e.g., 50.00) or type /cancel to abort.",
    )
    return
  }

  // Convert to smallest currency unit (cents)
  const amountInCents = Math.round(amount * 100)

  await publicAPICache.telegramSession.update(message.chat.id, {
    state: "add_transaction_memo",
    data: {
      ...data,
      amount: amountInCents,
      formattedAmount: amount.toFixed(2),
    },
  })

  let summary = `${data.emoji} *${data.typeName} Summary*\n\n`
  summary += `💳 Account: ${data.accountName}\n`
  if (data.categoryName) {
    summary += `📂 Category: ${data.categoryName}\n`
  }
  summary += `💰 Amount: $${amount.toFixed(2)}\n\n`
  summary += "Add a memo (optional):\n\n"
  summary += "Type a description or send /skip to create the transaction without a memo.\n"
  summary += "Type /cancel to abort."

  await telegramBot.sendMessage(message.chat.id, summary, {
    parse_mode: "Markdown",
  })
}

/**
 * Handle memo entry and create transaction
 */
async function handleTransactionMemoStep(
  message: TelegramMessage,
  userId: number,
  text: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!telegramBot) return

  const memo = text === "/skip" ? "" : text

  try {
    // Get user's groups to get the groupId
    const groupMemberships = await db.groupMembership.findMany(userId)
    if (groupMemberships.length === 0) {
      await telegramBot.sendMessage(
        message.chat.id,
        "❌ No groups found. Please create a group in the web app first.",
      )
      return
    }

    const groupId = groupMemberships[0].groupId // Use first group for simplicity

    // Create transaction
    const transactionData = {
      type: data.type as TransactionType,
      amount: data.amount as number,
      accountId: data.accountId as number,
      groupId,
      categoryId: data.categoryId as number | undefined,
      memo: memo.slice(0, 500), // Limit memo length
      createdBy: userId,
      timestamp: new Date(),
      direction: TransactionUtils.getDirectionFromType(data.type as TransactionType),
      originalAmount: data.amount as number,
    }

    const transaction = await db.transaction.createOne({ data: transactionData })

    // Clear session state
    await publicAPICache.telegramSession.clearState(message.chat.id)

    let successMessage = `✅ *Transaction Created Successfully!*\n\n`
    successMessage += `${data.emoji} ${data.typeName}\n`
    successMessage += `💳 Account: ${data.accountName}\n`
    if (data.categoryName) {
      successMessage += `📂 Category: ${data.categoryName}\n`
    }
    successMessage += `💰 Amount: $${data.formattedAmount}\n`
    if (memo) {
      successMessage += `📝 Memo: ${memo}\n`
    }
    successMessage += `\nTransaction ID: ${transaction.id}`

    await telegramBot.sendMessage(message.chat.id, successMessage, {
      parse_mode: "Markdown",
    })

    // Show quick actions menu
    await showQuickActionsMenu(message.chat.id)
  } catch (error) {
    console.error("Failed to create transaction:", error)
    await publicAPICache.telegramSession.clearState(message.chat.id)
    await telegramBot.sendMessage(
      message.chat.id,
      "❌ Failed to create transaction. Please try again later.",
    )
  }
}

/**
 * Show quick actions menu after completing an action
 */
async function showQuickActionsMenu(chatId: number): Promise<void> {
  if (!telegramBot) return

  const menuText = `🚀 *Quick Actions*

What would you like to do next?`

  await telegramBot.sendMessage(chatId, menuText, {
    parse_mode: "Markdown",
    reply_markup: TelegramMenus.getQuickActionsMenu(),
  })
}

/**
 * Handle /link command - Connect existing web account to Telegram
 */
export async function handleTelegramLink(message: TelegramMessage): Promise<void> {
  if (!telegramBot) return

  const chatId = message.chat.id
  const telegramUser = message.from

  if (!telegramUser) {
    await telegramBot.sendMessage(chatId, "❌ Unable to identify user.")
    return
  }

  // Extract connection code from command
  const text = message.text?.trim()
  const parts = text?.split(" ")

  if (!parts || parts.length !== 2) {
    await telegramBot.sendMessage(
      chatId,
      "❌ Invalid command format.\n\n" +
        "Usage: `/link CODE`\n\n" +
        "Example: `/link ABC123`\n\n" +
        "Get your connection code from the web app profile page.",
      { parse_mode: "Markdown" },
    )
    return
  }

  const connectionCode = parts[1].toUpperCase()

  if (connectionCode.length !== 6) {
    await telegramBot.sendMessage(
      chatId,
      "❌ Invalid connection code format.\n\n" +
        "Connection codes are 6 characters long.\n\n" +
        "Example: `/link ABC123`",
      { parse_mode: "Markdown" },
    )
    return
  }

  try {
    // Complete the connection
    const result = await auth.completeTelegramConnection(telegramUser.id, connectionCode)

    if (result.error) {
      await telegramBot.sendMessage(chatId, `❌ ${result.error}`)
      return
    }

    // Success! Account is now linked
    const userName = result.user?.firstName || "there"
    await telegramBot.sendMessage(
      chatId,
      `🎉 *Account Linked Successfully!*\n\n` +
        `Welcome ${userName}! Your Telegram account is now connected to your Financy account.\n\n` +
        `You can now:\n` +
        `• View your accounts and balances\n` +
        `• Check recent transactions\n` +
        `• Add new transactions\n` +
        `• Get financial analytics\n\n` +
        `Use the menu below to get started:`,
      {
        parse_mode: "Markdown",
        reply_markup: TelegramMenus.getMainMenu(),
      },
    )

    // Create session for the linked user
    await publicAPICache.telegramSession.set(chatId)
  } catch (error) {
    console.error("Failed to link account:", error)
    await telegramBot.sendMessage(
      chatId,
      "❌ Failed to link account. Please try again later or generate a new connection code.",
    )
  }
}
