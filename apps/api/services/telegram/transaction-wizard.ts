/**
 * Telegram Transaction Wizard
 * Centralized transaction creation flow management
 * Refactored to use CQRS for all data operations
 */
import { telegramBot } from "@api/services/telegram/+bot.ts"
import { TelegramMenus } from "@api/services/telegram/+menus.ts"
import { TelegramSessionManager } from "./session-manager.ts"
import { TelegramDisplayFormatter } from "./display-formatter.ts"
import { commandBus } from "@api/services/commandBus.ts"
import { queryBus } from "@api/services/queryBus.ts"
import { config } from "@api/services/config.ts"
import { CategoryType, TransactionType, TransactionUtils } from "@shared/types"
import { AccountListQuery, CategoryListQuery, UserGroupsQuery } from "@api/cqrs/queries.ts"
import { AccountTransferCommand, TransactionCreateCommand } from "@api/cqrs/commands.ts"

export class TelegramTransactionWizard {
  /**
   * Start transaction creation flow
   */
  static async start(chatId: number, userId: number): Promise<void> {
    if (!telegramBot) return

    try {
      const accountsResult = await queryBus.execute(new AccountListQuery({ userId }))

      if (accountsResult.accounts.length === 0) {
        await telegramBot.sendMessage(
          chatId,
          "📭 You don't have any accounts yet.\n\n" +
            `Use the web app to create your first account: ${config.webAppUrl}`,
          TelegramMenus.getMainMenu(),
        )
        return
      }

      await telegramBot.sendMessage(
        chatId,
        `➕ *Add New Transaction*\n\nWhat type of transaction would you like to add?`,
        TelegramMenus.getTransactionTypeMenu(),
      )
    } catch (error) {
      console.error("Failed to start transaction wizard:", error)
      await telegramBot.sendMessage(
        chatId,
        "❌ Failed to start transaction creation. Please try again later.",
      )
    }
  }

  /**
   * Handle transaction type selection
   */
  static async selectType(
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

    // Start transaction flow
    await TelegramSessionManager.startTransactionFlow(chatId, transactionType, typeName, emoji)

    // Show account selection
    await this.showAccountSelection(
      chatId,
      messageId,
      userId,
      `${emoji} *${typeName} Transaction*\n\nSelect the account:`,
    )
  }

  /**
   * Show account selection step
   */
  static async showAccountSelection(
    chatId: number,
    messageId: number | undefined,
    userId: number,
    customText?: string,
  ): Promise<void> {
    if (!telegramBot) return

    try {
      const accountsResult = await queryBus.execute(new AccountListQuery({ userId }))

      if (accountsResult.accounts.length === 0) {
        const text = "❌ No accounts found. Please create an account in the web app first."
        const keyboard = TelegramMenus.getMainMenu()

        if (messageId) {
          await telegramBot.editMessageText(chatId, messageId, text, keyboard)
        } else {
          await telegramBot.sendMessage(chatId, text, keyboard)
        }
        return
      }

      const text = customText || "💳 *Select Account*"
      const keyboard = TelegramMenus.getAccountSelectionMenu(accountsResult.accounts, "account")

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
      } else {
        await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
      }
    } catch (error) {
      console.error("Failed to show account selection:", error)
      await telegramBot.sendMessage(chatId, "❌ Failed to load accounts. Please try again later.")
    }
  }

  /**
   * Show destination account selection for transfers
   */
  static async showToAccountSelection(
    chatId: number,
    messageId: number | undefined,
    userId: number,
    fromAccount: { id: number; name: string },
  ): Promise<void> {
    if (!telegramBot) return

    try {
      const accountsResult = await queryBus.execute(new AccountListQuery({ userId }))
      const availableAccounts = accountsResult.accounts.filter((account) =>
        account.id !== fromAccount.id
      )

      if (availableAccounts.length === 0) {
        const text =
          "❌ You need at least 2 accounts to make a transfer. Please create another account in the web app first."
        const keyboard = TelegramMenus.getMainMenu()

        if (messageId) {
          await telegramBot.editMessageText(chatId, messageId, text, keyboard)
        } else {
          await telegramBot.sendMessage(chatId, text, keyboard)
        }
        return
      }

      const text = `🔄 *Transfer from ${fromAccount.name}*\n\nSelect destination account:`
      const keyboard = TelegramMenus.getTransferToAccountMenu(
        accountsResult.accounts,
        fromAccount.id,
      )

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
      } else {
        await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
      }
    } catch (error) {
      console.error("Failed to show destination account selection:", error)
      await telegramBot.sendMessage(chatId, "❌ Failed to load accounts. Please try again later.")
    }
  }

  /**
   * Handle account selection
   */
  static async selectAccount(
    chatId: number,
    messageId: number | undefined,
    userId: number,
    accountId: number,
  ): Promise<void> {
    if (!telegramBot) return

    try {
      const accountsResult = await queryBus.execute(new AccountListQuery({ userId }))
      const selectedAccount = accountsResult.accounts.find((a) => a.id === accountId)

      if (!selectedAccount) {
        await telegramBot.sendMessage(chatId, "❌ Invalid account selection.")
        return
      }

      const session = await TelegramSessionManager.get(chatId)
      const transactionType = session?.data?.type as TransactionType

      // Update session with account
      await TelegramSessionManager.setTransactionAccount(
        chatId,
        selectedAccount.id,
        selectedAccount.name,
      )

      if (transactionType === TransactionType.TRANSFER) {
        // For transfers, show destination account selection
        await this.showToAccountSelection(chatId, messageId, userId, selectedAccount)
      } else {
        // For expenses/income, show category selection
        await this.showCategorySelection(
          chatId,
          messageId,
          userId,
          transactionType,
          selectedAccount.name,
        )
      }
    } catch (error) {
      console.error("Failed to select account:", error)
      await telegramBot.sendMessage(chatId, "❌ Failed to select account. Please try again.")
    }
  }

  /**
   * Handle destination account selection for transfers
   */
  static async selectToAccount(
    chatId: number,
    messageId: number | undefined,
    userId: number,
    toAccountId: number,
  ): Promise<void> {
    if (!telegramBot) return

    try {
      const accountsResult = await queryBus.execute(new AccountListQuery({ userId }))
      const selectedToAccount = accountsResult.accounts.find((a) => a.id === toAccountId)

      if (!selectedToAccount) {
        await telegramBot.sendMessage(chatId, "❌ Invalid destination account selection.")
        return
      }

      const session = await TelegramSessionManager.get(chatId)
      if (!session?.data?.accountId || !session?.data?.accountName) {
        await telegramBot.sendMessage(chatId, "❌ Session error. Please start over.")
        return
      }

      // Update session with destination account
      await TelegramSessionManager.setTransactionToAccount(
        chatId,
        selectedToAccount.id,
        selectedToAccount.name,
      )

      // Show amount input for transfer
      await this.showTransferAmountInput(
        chatId,
        messageId,
        session.data.accountName,
        selectedToAccount.name,
      )
    } catch (error) {
      console.error("Failed to select destination account:", error)
      await telegramBot.sendMessage(
        chatId,
        "❌ Failed to select destination account. Please try again.",
      )
    }
  }

  /**
   * Show category selection step
   */
  static async showCategorySelection(
    chatId: number,
    messageId: number | undefined,
    userId: number,
    transactionType: TransactionType,
    accountName: string,
  ): Promise<void> {
    if (!telegramBot) return

    try {
      const categoriesResult = await queryBus.execute(
        new CategoryListQuery({
          userId,
          type: transactionType === TransactionType.EXPENSE
            ? CategoryType.EXPENSE
            : CategoryType.INCOME,
        }),
      )

      const filteredCategories = categoriesResult.categoriesWithUsage.filter((c) =>
        c.type ===
          (transactionType === TransactionType.EXPENSE ? CategoryType.EXPENSE : CategoryType.INCOME)
      )

      if (filteredCategories.length === 0) {
        const typeName = transactionType === TransactionType.EXPENSE ? "expense" : "income"
        const text =
          `❌ No ${typeName} categories found. Please create a category in the web app first.`
        const keyboard = TelegramMenus.getMainMenu()

        if (messageId) {
          await telegramBot.editMessageText(chatId, messageId, text, keyboard)
        } else {
          await telegramBot.sendMessage(chatId, text, keyboard)
        }
        return
      }

      const emoji = transactionType === TransactionType.EXPENSE ? "💸" : "💰"
      const typeName = transactionType === TransactionType.EXPENSE ? "Expense" : "Income"

      const text = `${emoji} *${typeName} - ${accountName}*\n\nSelect a category:`
      const keyboard = TelegramMenus.getCategorySelectionMenu(
        filteredCategories.map((c) => ({ id: c.id, name: c.name, icon: c.icon || undefined })),
        "category",
      )

      if (messageId) {
        await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
      } else {
        await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
      }
    } catch (error) {
      console.error("Failed to show category selection:", error)
      await telegramBot.sendMessage(chatId, "❌ Failed to load categories. Please try again later.")
    }
  }

  /**
   * Handle category selection
   */
  static async selectCategory(
    chatId: number,
    messageId: number | undefined,
    userId: number,
    categoryId: number,
  ): Promise<void> {
    if (!telegramBot) return

    try {
      const categoriesResult = await queryBus.execute(new CategoryListQuery({ userId }))
      const selectedCategory = categoriesResult.categoriesWithUsage.find((c) => c.id === categoryId)

      if (!selectedCategory) {
        await telegramBot.sendMessage(chatId, "❌ Invalid category selection.")
        return
      }

      // Update session with category
      await TelegramSessionManager.setTransactionCategory(
        chatId,
        selectedCategory.id,
        selectedCategory.name,
      )

      await this.showAmountInput(chatId, messageId, undefined, false, selectedCategory)
    } catch (error) {
      console.error("Failed to select category:", error)
      await telegramBot.sendMessage(chatId, "❌ Failed to select category. Please try again.")
    }
  }

  /**
   * Show amount input step
   */
  static async showAmountInput(
    chatId: number,
    messageId: number | undefined,
    accountName?: string,
    isTransfer = false,
    category?: { icon?: string | null; name: string },
  ): Promise<void> {
    if (!telegramBot) return

    const session = await TelegramSessionManager.get(chatId)
    if (!session?.data) return

    let text: string

    if (isTransfer) {
      text = `🔄 *Transfer from ${accountName || session.data.accountName}*\n\n` +
        "Please enter the amount to transfer:\n\n" +
        "Example: 50.00 or 100"
    } else {
      text = `${session.data.emoji} *${session.data.typeName} - ${session.data.accountName}*\n`
      if (category) {
        text += `📂 Category: ${category.icon || "•"} ${category.name}\n\n`
      }
      text += "Please enter the amount:\n\n" +
        "Example: 50.00 or 100"
    }

    const keyboard = TelegramMenus.getCancelMenu(isTransfer ? "menu_add" : "tx_select_account")

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
    } else {
      await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
    }
  }

  /**
   * Show amount input step specifically for transfers
   */
  static async showTransferAmountInput(
    chatId: number,
    messageId: number | undefined,
    fromAccountName: string,
    toAccountName: string,
  ): Promise<void> {
    if (!telegramBot) return

    const text = `🔄 *Transfer*\n\n` +
      `From: 💳 ${fromAccountName}\n` +
      `To: 💳 ${toAccountName}\n\n` +
      "Please enter the amount to transfer:\n\n" +
      "Example: 50.00 or 100"

    const keyboard = TelegramMenus.getCancelMenu("tx_select_account")

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, keyboard, "Markdown")
    } else {
      await telegramBot.sendMessage(chatId, text, keyboard, "Markdown")
    }
  }

  /**
   * Handle amount input from text message
   */
  static async handleAmountInput(chatId: number, _userId: number, text: string): Promise<void> {
    if (!telegramBot) return

    const amount = parseFloat(text)

    if (isNaN(amount) || amount <= 0) {
      await telegramBot.sendMessage(
        chatId,
        "❌ Please enter a valid positive amount (e.g., 50.00) or type /cancel to abort.",
      )
      return
    }

    // Convert to smallest currency unit (cents)
    const amountInCents = Math.round(amount * 100)

    // Update session with amount
    await TelegramSessionManager.setTransactionAmount(chatId, amountInCents, amount.toFixed(2))

    // Show memo input
    await this.showMemoInput(chatId)
  }

  /**
   * Show memo input step
   */
  static async showMemoInput(chatId: number): Promise<void> {
    if (!telegramBot) return

    const session = await TelegramSessionManager.get(chatId)
    if (!session?.data) return

    const summary = TelegramDisplayFormatter.formatTransactionSummary({
      emoji: session.data.emoji || "",
      typeName: session.data.typeName || "",
      accountName: session.data.accountName || "",
      categoryName: session.data.categoryName,
      formattedAmount: session.data.formattedAmount || "0",
    })

    const text = summary + "\n\nAdd a memo (optional):\n\n" +
      "Type a description or send /skip to create the transaction without a memo.\n" +
      "Type /cancel to abort."

    await telegramBot.sendMessage(chatId, text, undefined, "Markdown")
  }

  /**
   * Handle memo input and create transaction
   */
  static async handleMemoAndCreate(chatId: number, userId: number, text: string): Promise<void> {
    if (!telegramBot) return

    const memo = text === "/skip" ? "" : text

    try {
      const session = await TelegramSessionManager.get(chatId)
      if (!session?.data) {
        await telegramBot.sendMessage(chatId, "❌ Session expired. Please start over with /add.")
        return
      }

      // Get user's groups using CQRS
      const userGroupsResult = await queryBus.execute(new UserGroupsQuery({ userId }))
      if (userGroupsResult.groups.length === 0) {
        await telegramBot.sendMessage(
          chatId,
          "❌ No groups found. Please create a group in the web app first.",
        )
        return
      }

      const groupId = userGroupsResult.groups[0].id // Use first group for simplicity
      const transactionType = session.data.type as TransactionType

      // Handle transfers differently using AccountTransferCommand
      if (transactionType === TransactionType.TRANSFER) {
        if (!session.data.accountId || !session.data.toAccountId || !session.data.amount) {
          await telegramBot.sendMessage(chatId, "❌ Missing transfer data. Please start over.")
          return
        }

        const transferResult = await commandBus.execute(
          new AccountTransferCommand({
            fromAccountId: session.data.accountId,
            toAccountId: session.data.toAccountId,
            amount: session.data.amount,
            memo: memo.slice(0, 500),
            timestamp: new Date(),
            userId,
          }),
        )

        // Clear session state
        await TelegramSessionManager.clearState(chatId)

        // Show success message for transfer
        const successMessage = `✅ *Transfer Completed Successfully!*\n\n` +
          `🔄 From: ${session.data.accountName}\n` +
          `🔄 To: ${session.data.toAccountName}\n` +
          `💰 Amount: ${session.data.formattedAmount}\n` +
          (memo ? `📝 Memo: ${memo}\n` : "") +
          `\nTransfer ID: ${transferResult.fromTransaction.id} ↔ ${transferResult.toTransaction.id}`

        await telegramBot.sendMessage(chatId, successMessage, undefined, "Markdown")
      } else {
        // Handle regular expense/income transactions
        const transactionData = {
          type: transactionType,
          amount: session.data.amount as number,
          accountId: session.data.accountId as number,
          groupId,
          categoryId: session.data.categoryId as number | undefined,
          memo: memo.slice(0, 500), // Limit memo length
          createdBy: userId,
          timestamp: new Date(),
          direction: TransactionUtils.getDirectionFromType(transactionType),
          originalAmount: session.data.amount as number,
        }

        const result = await commandBus.execute(
          new TransactionCreateCommand({
            transaction: transactionData,
            userId,
          }),
        )

        // Clear session state
        await TelegramSessionManager.clearState(chatId)

        // Show success message for regular transaction
        const successMessage = TelegramDisplayFormatter.formatTransactionSummary({
          emoji: session.data.emoji || "",
          typeName: session.data.typeName || "",
          accountName: session.data.accountName || "",
          categoryName: session.data.categoryName,
          formattedAmount: session.data.formattedAmount || "0",
          memo: memo || undefined,
        })

        await telegramBot.sendMessage(
          chatId,
          `✅ *Transaction Created Successfully!*\n\n${successMessage}\n\nTransaction ID: ${result.transaction.id}`,
          undefined,
          "Markdown",
        )
      }

      // Show quick actions menu
      await this.showQuickActions(chatId)
    } catch (error) {
      console.error("Failed to create transaction:", error)
      await TelegramSessionManager.clearState(chatId)
      await telegramBot.sendMessage(
        chatId,
        "❌ Failed to create transaction. Please try again later.",
      )
    }
  }

  /**
   * Show quick actions menu after completing a transaction
   */
  static async showQuickActions(chatId: number): Promise<void> {
    if (!telegramBot) return

    const menuText = `🚀 *Quick Actions*\n\nWhat would you like to do next?`

    await telegramBot.sendMessage(chatId, menuText, TelegramMenus.getQuickActionsMenu(), "Markdown")
  }

  /**
   * Cancel transaction creation and clear state
   */
  static async cancel(chatId: number, messageId?: number): Promise<void> {
    if (!telegramBot) return

    await TelegramSessionManager.clearState(chatId)

    const text = "✅ Transaction cancelled."
    const keyboard = TelegramMenus.getMainMenu()

    if (messageId) {
      await telegramBot.editMessageText(chatId, messageId, text, keyboard)
    } else {
      await telegramBot.sendMessage(chatId, text, keyboard)
    }
  }
}
