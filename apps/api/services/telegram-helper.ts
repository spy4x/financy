import { db } from "@api/services/db.ts"
import { auth } from "@api/services/auth/+index.ts"
import type { Account, Currency, User } from "@shared/types"
import { CategoryType, TransactionType } from "@shared/types"
import { formatMoney } from "@shared/helpers/format.ts"
import { calculateAccountBalance } from "@shared/helpers/account-balance.ts"

/**
 * Telegram Bot Helper Service
 * Composes operations from existing DB methods without duplicating logic
 */
export class TelegramHelper {
  /**
   * Find user by Telegram chat ID using auth service
   */
  static async findUserByTelegramId(telegramId: number): Promise<User | null> {
    return await auth.findUserByTelegramId(telegramId)
  }

  /**
   * Create new user with Telegram authentication using auth service
   */
  static async createUserWithTelegram(
    telegramId: number,
    firstName: string,
    lastName?: string,
  ): Promise<User | null> {
    // Check if already registered
    if (await auth.isTelegramIdRegistered(telegramId)) {
      return null
    }

    // No context needed for Telegram auth (no web cookies)
    const authData = await auth.signUpWithTelegram(
      telegramId,
      firstName,
      lastName,
    )

    return authData?.user || null
  }

  /**
   * Get user's accounts with formatted data for Telegram display
   */
  static async getUserAccountsDisplay(userId: number): Promise<{
    accounts: Account[]
    currencies: Map<number, Currency>
    formatAccountBalance: (accountId: number) => string
  }> {
    // Use existing methods - no balance calculation in DB layer
    const accounts = await db.account.findMany(userId)

    if (accounts.length === 0) {
      return {
        accounts: [],
        currencies: new Map(),
        formatAccountBalance: () => "0.00",
      }
    }

    // Get currencies using existing method
    const currencies = await db.currency.findMany()
    const currencyMap = new Map(currencies.map((c) => [c.id, c]))

    // Get transactions using existing method for balance calculation
    const transactions = await db.transaction.findMany({ filter: { userId } })

    const formatAccountBalance = (accountId: number): string => {
      const account = accounts.find((a) => a.id === accountId)
      if (!account) return "$0.00"

      const currency = currencyMap.get(account.currencyId)
      const balance = calculateAccountBalance(account, transactions)

      return formatMoney(balance, currency?.code || "USD")
    }

    return { accounts, currencies: currencyMap, formatAccountBalance }
  }

  /**
   * Get user's recent transactions with formatted data for Telegram display
   */
  static async getUserRecentTransactionsDisplay(userId: number, limit = 10): Promise<{
    transactions: Array<{
      id: number
      accountName: string
      categoryName?: string
      formattedAmount: string
      direction: number
      type: number
      memo: string | null
      timestamp: string
    }>
  }> {
    // Use existing methods with pagination for better performance
    const transactions = await db.transaction.findMany({
      filter: { userId },
      pagination: { limit, offset: 0 },
    })
    const accounts = await db.account.findMany(userId)
    const categories = await db.category.findMany(userId)
    const currencies = await db.currency.findMany()

    // Create lookup maps
    const accountMap = new Map(accounts.map((a) => [a.id, a]))
    const categoryMap = new Map(categories.map((c) => [c.id, c]))
    const currencyMap = new Map(currencies.map((c) => [c.id, c]))

    const formattedTransactions = transactions.map((txn) => {
      const account = accountMap.get(txn.accountId)
      const category = categoryMap.get(txn.categoryId || 0)
      const currency = currencyMap.get(account?.currencyId || 0)

      return {
        id: txn.id,
        accountName: account?.name || "Unknown",
        categoryName: category?.name,
        formattedAmount: formatMoney(Math.abs(txn.amount), currency?.code || "USD"),
        direction: txn.direction || 1,
        type: txn.type,
        memo: txn.memo,
        timestamp: txn.timestamp.toISOString(),
      }
    })

    return { transactions: formattedTransactions }
  }

  /**
   * Get user's categories with monthly usage and formatted data for Telegram display
   */
  static async getUserCategoriesWithUsage(userId: number): Promise<{
    categoriesWithUsage: Array<{
      id: number
      name: string
      type: CategoryType
      icon: string | null
      monthlyLimit: number | null
      monthlyUsed: number
      formattedMonthlyLimit: string
      formattedMonthlyUsed: string
    }>
  }> {
    // Get categories and transactions
    const categories = await db.category.findMany(userId)
    const transactions = await db.transaction.findMany({ filter: { userId } })
    const currencies = await db.currency.findMany()
    const currencyMap = new Map(currencies.map((c) => [c.id, c]))

    // Calculate current month range
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    // Filter transactions for current month
    const monthlyTransactions = transactions.filter((txn) => {
      const txnDate = new Date(txn.timestamp)
      return txnDate >= startOfMonth && txnDate <= endOfMonth
    })

    const categoriesWithUsage = categories.map((category) => {
      // Calculate monthly usage for this category
      const categoryTransactions = monthlyTransactions.filter((txn) =>
        txn.categoryId === category.id
      )
      const monthlyUsed = categoryTransactions.reduce((sum, txn) => sum + Math.abs(txn.amount), 0)

      // Get currency from group (simplified - using first account's currency as fallback)
      const defaultCurrency = currencyMap.get(1) // Assuming USD has id 1
      const currencyCode = defaultCurrency?.code || "USD"

      return {
        id: category.id,
        name: category.name,
        type: category.type,
        icon: category.icon || null,
        monthlyLimit: category.monthlyLimit || null,
        monthlyUsed,
        formattedMonthlyLimit: category.monthlyLimit
          ? formatMoney(category.monthlyLimit, currencyCode)
          : "No limit",
        formattedMonthlyUsed: formatMoney(monthlyUsed, currencyCode),
      }
    })

    return { categoriesWithUsage }
  }

  /**
   * Get basic analytics for user
   */
  static async getUserAnalytics(userId: number): Promise<{
    currentMonthExpenses: number
    currentMonthIncome: number
    formattedExpenses: string
    formattedIncome: string
    formattedNetFlow: string
    topExpenseCategories: Array<{
      name: string
      amount: number
      formattedAmount: string
      icon?: string
    }>
    accountsOverview: Array<{
      name: string
      balance: number
      formattedBalance: string
      currency: string
    }>
  }> {
    // Get data
    const transactions = await db.transaction.findMany({ filter: { userId } })
    const categories = await db.category.findMany(userId)
    const accounts = await db.account.findMany(userId)
    const currencies = await db.currency.findMany()

    // Create lookup maps
    const categoryMap = new Map(categories.map((c) => [c.id, c]))
    const currencyMap = new Map(currencies.map((c) => [c.id, c]))

    // Calculate current month range
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    // Filter transactions for current month
    const monthlyTransactions = transactions.filter((txn) => {
      const txnDate = new Date(txn.timestamp)
      return txnDate >= startOfMonth && txnDate <= endOfMonth
    })

    // Calculate totals
    const expenseTransactions = monthlyTransactions.filter((txn) =>
      txn.type === TransactionType.EXPENSE
    )
    const incomeTransactions = monthlyTransactions.filter((txn) =>
      txn.type === TransactionType.INCOME
    )

    const currentMonthExpenses = expenseTransactions.reduce(
      (sum, txn) => sum + Math.abs(txn.amount),
      0,
    )
    const currentMonthIncome = incomeTransactions.reduce(
      (sum, txn) => sum + Math.abs(txn.amount),
      0,
    )
    const netFlow = currentMonthIncome - currentMonthExpenses

    // Get default currency (simplified)
    const defaultCurrency = currencyMap.get(1) // Assuming USD has id 1
    const currencyCode = defaultCurrency?.code || "USD"

    // Calculate top expense categories
    const categoryExpenses = new Map<number, number>()
    expenseTransactions.forEach((txn) => {
      if (txn.categoryId) {
        const current = categoryExpenses.get(txn.categoryId) || 0
        categoryExpenses.set(txn.categoryId, current + Math.abs(txn.amount))
      }
    })

    const topExpenseCategories = Array.from(categoryExpenses.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([categoryId, amount]) => {
        const category = categoryMap.get(categoryId)
        return {
          name: category?.name || "Unknown",
          amount,
          formattedAmount: formatMoney(amount, currencyCode),
          icon: category?.icon || undefined,
        }
      })

    // Get accounts overview
    const accountsOverview = accounts.map((account) => {
      const balance = calculateAccountBalance(account, transactions)
      const currency = currencyMap.get(account.currencyId)

      return {
        name: account.name,
        balance,
        formattedBalance: formatMoney(balance, currency?.code || "USD"),
        currency: currency?.code || "USD",
      }
    })

    return {
      currentMonthExpenses,
      currentMonthIncome,
      formattedExpenses: formatMoney(currentMonthExpenses, currencyCode),
      formattedIncome: formatMoney(currentMonthIncome, currencyCode),
      formattedNetFlow: formatMoney(netFlow, currencyCode),
      topExpenseCategories,
      accountsOverview,
    }
  }
}
