/**
 * Telegram Updates Handler - Clean Implementation
 *
 * This handler routes Telegram updates to the appropriate processing logic.
 * It uses CQRS for all business logic and the existing telegram services
 * for telegram-specific functionality like formatting and session management.
 */

import { telegramBot } from "@api/services/telegram/+bot.ts"
import { TelegramUserUtils } from "@api/services/telegram/user-utils.ts"
import { TelegramSessionManager } from "@api/services/telegram/session-manager.ts"
import { TelegramErrorHandler } from "@api/services/telegram/error-handler.ts"
import { TelegramDisplayFormatter } from "@api/services/telegram/display-formatter.ts"
import { TelegramMenus } from "@api/services/telegram/+menus.ts"
import { TelegramTransactionWizard } from "@api/services/telegram/transaction-wizard.ts"
import { config } from "@api/services/config.ts"
import type { TelegramUpdate } from "@api/services/telegram/+bot.ts"

/**
 * Main update handler that routes messages and callbacks to appropriate handlers
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (!telegramBot) {
    console.error("Telegram bot not configured")
    return
  }

  try {
    // Handle callback queries (inline keyboard button presses)
    if (update.callback_query) {
      await handleTelegramCallback(update.callback_query)
      return
    }

    // Handle regular messages
    if (update.message) {
      await handleTelegramMessage(update.message)
      return
    }

    // Log unhandled update types for debugging
    console.warn("Unhandled Telegram update type:", JSON.stringify(update, null, 2))
  } catch (error) {
    console.error("Error handling Telegram update:", error)

    // Try to get chat ID for error response
    const chatId = update.callback_query?.message?.chat.id || update.message?.chat.id
    if (chatId) {
      await telegramBot.sendMessage(chatId, "❌ Something went wrong. Please try again.")
    }
  }
}

/**
 * Handle regular text messages and commands
 */
async function handleTelegramMessage(message: TelegramUpdate["message"]): Promise<void> {
  if (!message || !telegramBot) return

  const text = message.text?.trim()
  if (!text) return

  const chatId = message.chat.id

  // Handle commands
  if (text.startsWith("/")) {
    const command = text.split(" ")[0].toLowerCase()
    const args = text.split(" ").slice(1)

    try {
      switch (command) {
        case "/start":
          await handleStartCommand(message, args)
          break
        case "/cancel":
          await handleCancelCommand(message)
          break
        case "/skip": {
          // Handle skip command during transaction flow
          const session = await TelegramSessionManager.get(chatId)
          const currentStep = TelegramSessionManager.getTransactionStep(session)
          if (currentStep === "memo") {
            const userContext = await TelegramUserUtils.getValidatedUserOrSendError(
              chatId,
              message.from?.id || 0,
            )
            if (userContext) {
              await TelegramTransactionWizard.handleMemoAndCreate(
                chatId,
                userContext.userId,
                "/skip",
              )
            }
          } else {
            await telegramBot.sendMessage(
              chatId,
              "❓ Skip command can only be used during memo input.",
            )
          }
          break
        }
        case "/link":
          await handleLinkCommand(message, args)
          break
        default:
          // Guide users to use buttons instead of commands
          await telegramBot.sendMessage(
            chatId,
            "💡 I work best with buttons! Use the menu below to navigate:",
            TelegramMenus.getMainMenu(),
          )
      }
    } catch (error) {
      console.error(`Error handling command ${command}:`, error)
      await telegramBot.sendMessage(chatId, "❌ Something went wrong processing that command.")
    }
  } else {
    // Handle regular text messages (for conversation flows)
    try {
      await handleTextMessage(message)
    } catch (error) {
      console.error("Error handling text message:", error)
      await telegramBot.sendMessage(chatId, "❌ Something went wrong processing your message.")
    }
  }
}

/**
 * Handle callback queries from inline keyboards
 */
async function handleTelegramCallback(
  callbackQuery: TelegramUpdate["callback_query"],
): Promise<void> {
  if (!callbackQuery || !callbackQuery.data || !telegramBot) return

  const chatId = callbackQuery.message?.chat.id
  const messageId = callbackQuery.message?.message_id
  const data = callbackQuery.data

  // Always answer the callback query to stop the loading spinner
  await telegramBot.answerCallbackQuery(callbackQuery.id)

  if (!chatId) return

  try {
    // Validate user session
    const userContext = await TelegramUserUtils.getValidatedUserOrSendError(
      chatId,
      callbackQuery.from.id,
    )
    if (!userContext) {
      return
    }

    // Route based on callback data prefix
    if (data.startsWith("menu_")) {
      await handleMenuCallback(chatId, messageId, data, userContext.userId)
    } else if (data.startsWith("tx_")) {
      await handleTransactionCallback(chatId, messageId, data, userContext.userId)
    } else if (data.startsWith("account_")) {
      await handleAccountCallback(chatId, messageId, data, userContext.userId)
    } else if (data.startsWith("to_account_")) {
      await handleToAccountCallback(chatId, messageId, data, userContext.userId)
    } else if (data.startsWith("category_")) {
      await handleCategoryCallback(chatId, messageId, data, userContext.userId)
    } else if (data === "cancel") {
      await handleCancelCallback(chatId, messageId)
    } else if (data === "noop") {
      // Do nothing for pagination indicators
      return
    } else {
      console.warn("Unhandled callback data:", data)
    }
  } catch (error) {
    console.error(`Error handling callback ${data}:`, error)
    await telegramBot.sendMessage(chatId, "❌ Something went wrong processing that action.")
  }
}

// #region Command Handlers

async function handleStartCommand(
  message: TelegramUpdate["message"],
  _args: string[],
): Promise<void> {
  if (!message || !telegramBot) return

  const chatId = message.chat.id
  const telegramUser = message.from

  if (!telegramUser) {
    await telegramBot.sendMessage(chatId, "❌ Unable to identify user.")
    return
  }

  // Check if user is already authenticated
  const user = await TelegramUserUtils.findUser(telegramUser.id)

  if (user) {
    // User already exists and is linked
    await telegramBot.sendMessage(
      chatId,
      `👋 Welcome back, ${user.firstName || "there"}!\n\n` +
        `Your Telegram is already connected to your Financy account.\n\n` +
        `Use the menu below to get started:`,
      TelegramMenus.getMainMenu(),
    )

    // Create/refresh session
    await TelegramSessionManager.set(chatId)
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
      `5. 🔗 Use \`/link CODE\` here to connect\n\n` +
      `💡 Once connected, you can view balances, add transactions, and more directly in Telegram!\n\n` +
      `Use the menu buttons to navigate - no need to memorize commands!`,
    undefined,
    "Markdown",
  )
}

async function handleCancelCommand(message: TelegramUpdate["message"]): Promise<void> {
  if (!message || !telegramBot) return

  const chatId = message.chat.id

  // Check if user is in transaction flow
  const session = await TelegramSessionManager.get(chatId)
  if (TelegramSessionManager.isInTransactionFlow(session)) {
    await TelegramTransactionWizard.cancel(chatId)
    return
  }

  // Clear any session state and show main menu
  await TelegramSessionManager.clearState(chatId)

  await telegramBot.sendMessage(
    chatId,
    "✅ Operation cancelled. What would you like to do next?",
    TelegramMenus.getMainMenu(),
  )
}

async function handleLinkCommand(
  message: TelegramUpdate["message"],
  _args: string[],
): Promise<void> {
  if (!message || !telegramBot) return

  // TODO: Implement linking logic using auth service
  // For now, show simple message
  await telegramBot.sendMessage(
    message.chat.id,
    "🔗 Account linking not yet implemented in the new handler. Please use the web app for now.",
  )
}

async function handleTextMessage(message: TelegramUpdate["message"]): Promise<void> {
  if (!message || !telegramBot) return

  const userContext = await TelegramUserUtils.getValidatedUserOrSendError(
    message.chat.id,
    message.from?.id || 0,
  )
  if (!userContext) return

  const text = message.text?.trim()
  if (!text) return

  // Check if user is in transaction flow
  const session = await TelegramSessionManager.get(message.chat.id)
  const currentStep = TelegramSessionManager.getTransactionStep(session)

  if (currentStep === "amount") {
    // Handle amount input
    await TelegramTransactionWizard.handleAmountInput(message.chat.id, userContext.userId, text)
    return
  }

  if (currentStep === "memo") {
    // Handle memo input and create transaction
    await TelegramTransactionWizard.handleMemoAndCreate(message.chat.id, userContext.userId, text)
    return
  }

  // Not in transaction flow - show help
  await telegramBot.sendMessage(
    message.chat.id,
    "💡 I work best with buttons! Use the menu below to navigate:",
    TelegramMenus.getMainMenu(),
  )
}

// #endregion Command Handlers

// #region Callback Handlers

async function handleMenuCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
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
        await TelegramTransactionWizard.start(chatId, userId)
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
      default:
        console.warn("Unhandled menu callback:", data)
        await telegramBot.sendMessage(chatId, "❓ Unknown menu option.")
    }
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "menu navigation")
  }
}

async function handleTransactionCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Handle transaction type selection
    if (data === "tx_type_expense" || data === "tx_type_income" || data === "tx_type_transfer") {
      await TelegramTransactionWizard.selectType(chatId, messageId, data, userId)
      return
    }

    // Handle going back to account selection
    if (data === "tx_select_account") {
      await TelegramTransactionWizard.showAccountSelection(chatId, messageId, userId)
      return
    }

    // Handle transaction confirmation
    if (data === "tx_confirm") {
      await telegramBot.sendMessage(chatId, "🚧 Transaction confirmation not yet implemented.")
      return
    }

    // Handle transaction cancellation
    if (data === "tx_cancel") {
      await TelegramTransactionWizard.cancel(chatId, messageId)
      return
    }

    // Handle unknown transaction callback
    console.warn("Unhandled transaction callback:", data)
    await telegramBot.sendMessage(chatId, "❓ Unknown transaction operation.")
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "transaction operation")
  }
}

async function handleAccountCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Extract account ID from callback data (format: "account_123")
    const accountId = parseInt(data.replace("account_", ""))
    if (isNaN(accountId)) {
      await telegramBot.sendMessage(chatId, "❌ Invalid account selection.")
      return
    }

    // Check if user is in transaction flow
    const session = await TelegramSessionManager.get(chatId)
    if (TelegramSessionManager.isInTransactionFlow(session)) {
      // Handle account selection in transaction flow
      await TelegramTransactionWizard.selectAccount(chatId, messageId, userId, accountId)
      return
    }

    // If not in transaction flow, this might be for viewing account details
    // For now, just show a message
    await telegramBot.sendMessage(chatId, "🚧 Account details view not yet implemented.")
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "account operation")
  }
}

async function handleToAccountCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Extract account ID from callback data (format: "to_account_123")
    const toAccountId = parseInt(data.replace("to_account_", ""))
    if (isNaN(toAccountId)) {
      await telegramBot.sendMessage(chatId, "❌ Invalid destination account selection.")
      return
    }

    // Check if user is in transaction flow
    const session = await TelegramSessionManager.get(chatId)
    if (TelegramSessionManager.isInTransactionFlow(session)) {
      // Handle destination account selection in transfer flow
      await TelegramTransactionWizard.selectToAccount(chatId, messageId, userId, toAccountId)
      return
    }

    // If not in transaction flow, this shouldn't happen
    await telegramBot.sendMessage(chatId, "❌ Invalid operation - not in transfer flow.")
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "destination account operation")
  }
}

async function handleCategoryCallback(
  chatId: number,
  messageId: number | undefined,
  data: string,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Extract category ID from callback data (format: "category_123")
    const categoryId = parseInt(data.replace("category_", ""))
    if (isNaN(categoryId)) {
      await telegramBot.sendMessage(chatId, "❌ Invalid category selection.")
      return
    }

    // Check if user is in transaction flow
    const session = await TelegramSessionManager.get(chatId)
    if (TelegramSessionManager.isInTransactionFlow(session)) {
      // Handle category selection in transaction flow
      await TelegramTransactionWizard.selectCategory(chatId, messageId, userId, categoryId)
      return
    }

    // If not in transaction flow, this might be for viewing category details
    // For now, just show a message
    await telegramBot.sendMessage(chatId, "🚧 Category details view not yet implemented.")
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "category operation")
  }
}

async function handleCancelCallback(
  chatId: number,
  _messageId: number | undefined,
): Promise<void> {
  if (!telegramBot) return

  // Clear session and show main menu
  await TelegramSessionManager.clearState(chatId)

  if (_messageId) {
    await telegramBot.editMessageText(
      chatId,
      _messageId,
      "✅ Operation cancelled. What would you like to do next?",
      TelegramMenus.getMainMenu(),
    )
  } else {
    await telegramBot.sendMessage(
      chatId,
      "✅ Operation cancelled. What would you like to do next?",
      TelegramMenus.getMainMenu(),
    )
  }
}

// #endregion Callback Handlers

// #region Menu Display Functions

async function showMainMenu(chatId: number, messageId?: number): Promise<void> {
  if (!telegramBot) return

  const text = `🏠 *Financy Main Menu*

Welcome! Choose an option below:`

  const keyboard = TelegramMenus.getMainMenu()

  if (messageId) {
    await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
  } else {
    await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
  }
}

async function showAccounts(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Get accounts using CQRS
    const result = await telegramBot.getUserAccountsDisplay(userId)

    if (result.accounts.length === 0) {
      await TelegramErrorHandler.handleNoAccounts(chatId)
      return
    }

    let text = "💰 *Your Accounts*\n\n"
    result.accounts.forEach((account) => {
      const currency = result.currencies.get(account.currencyId)
      text += `💳 *${account.name}*\n`
      text += `   Balance: ${result.formatAccountBalance(account.id)}\n`
      text += `   Currency: ${currency?.code || "USD"}\n\n`
    })

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
    } else {
      await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
    }
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "loading accounts")
  }
}

async function showRecentTransactions(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Get recent transactions using CQRS
    const result = await telegramBot.getUserRecentTransactions(userId, 10)

    // Format and display transactions
    const text = TelegramDisplayFormatter.formatTransactionsList(result.transactions)

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
    } else {
      await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
    }
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "loading transactions")
  }
}

async function showCategories(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Get categories using CQRS
    const result = await telegramBot.getUserCategoriesWithUsage(userId)

    if (result.categoriesWithUsage.length === 0) {
      await TelegramErrorHandler.handleNoCategories(chatId, "")
      return
    }

    // Format and display categories
    const text = TelegramDisplayFormatter.formatCategoriesWithUsage(result.categoriesWithUsage)

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
    } else {
      await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
    }
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "loading categories")
  }
}

async function showAnalytics(
  chatId: number,
  messageId: number | undefined,
  userId: number,
): Promise<void> {
  if (!telegramBot) return

  try {
    // Get analytics using CQRS
    const analytics = await telegramBot.getUserAnalytics(userId)

    // Format and display analytics
    const text = TelegramDisplayFormatter.formatAnalytics(analytics)

    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
    } else {
      await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
    }
  } catch (error) {
    await TelegramErrorHandler.handleSystemError(chatId, error, "loading analytics")
  }
}

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
• Cancel any operation with the ❌ button
• Everything works through buttons - no commands needed!

**Essential Commands:**
/start - Show main menu
/cancel - Cancel current operation
/skip - Skip memo input during transactions`

  const keyboard = TelegramMenus.getMainMenu()

  if (messageId) {
    await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
  } else {
    await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
  }
}

// #endregion Menu Display Functions
