/**
 * Telegram Display Formatter Service
 * Centralized formatting for all Telegram bot displays
 */
import { formatMoney } from "@shared/helpers/format.ts"
import { formatTime } from "@shared/helpers/format.ts"
import { config } from "@api/services/config.ts"
import { Account, Currency, TransactionDirection, TransactionType } from "@shared/types"

export class TelegramDisplayFormatter {
  /**
   * Format account balance display
   */
  static formatAccountBalance(
    _account: Account,
    balance: number,
    currency?: Currency,
  ): string {
    return formatMoney(balance, currency?.code || "USD")
  }

  /**
   * Format accounts list for display
   */
  static formatAccountsList(
    accounts: Account[],
    currencies: Map<number, Currency>,
    formatAccountBalance: (accountId: number) => string,
  ): string {
    if (accounts.length === 0) {
      return "📭 You don't have any accounts yet.\n\n" +
        `Use the web app to create your first account: ${config.webAppUrl}`
    }

    let text = "💰 *Your Accounts*\n\n"

    for (const account of accounts) {
      const formattedBalance = formatAccountBalance(account.id)
      const currency = currencies.get(account.currencyId)

      text += `💳 *${account.name}*\n`
      text += `   Balance: ${formattedBalance}\n`
      text += `   Currency: ${currency?.code || "USD"}\n\n`
    }

    return text
  }

  /**
   * Format transactions list for display
   */
  static formatTransactionsList(
    transactions: Array<{
      id: number
      accountName: string
      categoryName?: string
      formattedAmount: string
      direction: number
      type: number
      memo: string | null
      timestamp: string
    }>,
  ): string {
    if (transactions.length === 0) {
      return "📭 No transactions found.\n\nUse the menu below to add your first transaction!"
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

    return text
  }

  /**
   * Generate progress bar for monthly limits
   */
  static generateProgressBar(percent: number): string {
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
   * Format categories with usage for display
   */
  static formatCategoriesWithUsage(
    categoriesWithUsage: Array<{
      id: number
      name: string
      type: number
      icon: string | null
      monthlyLimit: number | null
      monthlyUsed: number
      formattedMonthlyLimit: string
      formattedMonthlyUsed: string
    }>,
  ): string {
    if (categoriesWithUsage.length === 0) {
      return "📭 You don't have any categories yet."
    }

    let text = "📋 *Your Categories*\n\n"

    const expenseCategories = categoriesWithUsage.filter((c) => c.type === 1) // CategoryType.EXPENSE
    const incomeCategories = categoriesWithUsage.filter((c) => c.type === 2) // CategoryType.INCOME

    if (expenseCategories.length > 0) {
      text += "💸 *Expense Categories*\n"
      for (const category of expenseCategories) {
        text += `   ${category.icon || "•"} ${category.name}\n`

        if (category.monthlyLimit && category.monthlyLimit > 0) {
          const usedPercent = Math.round((category.monthlyUsed / category.monthlyLimit) * 100)
          const progressBar = this.generateProgressBar(usedPercent)

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

    return text
  }

  /**
   * Format analytics for display
   */
  static formatAnalytics(analytics: {
    formattedIncome: string
    formattedExpenses: string
    formattedNetFlow: string
    topExpenseCategories: Array<{
      name: string
      formattedAmount: string
      icon?: string
    }>
    accountsOverview: Array<{
      name: string
      balance: number
      formattedBalance: string
    }>
  }): string {
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

    return text
  }

  /**
   * Format transaction summary for confirmation
   */
  static formatTransactionSummary(data: {
    emoji: string
    typeName: string
    accountName: string
    categoryName?: string
    formattedAmount: string
    memo?: string
  }): string {
    let summary = `${data.emoji} *${data.typeName} Summary*\n\n`
    summary += `💳 Account: ${data.accountName}\n`
    if (data.categoryName) {
      summary += `📂 Category: ${data.categoryName}\n`
    }
    summary += `💰 Amount: $${data.formattedAmount}\n`
    if (data.memo) {
      summary += `📝 Memo: ${data.memo}\n`
    }
    return summary
  }
}
