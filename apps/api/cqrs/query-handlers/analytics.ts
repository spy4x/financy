import { QueryHandler } from "@shared/cqrs/types.ts"
import { AnalyticsQuery, AnalyticsResult } from "../queries.ts"
import { db } from "@api/services/db.ts"
import { formatMoney } from "@shared/helpers/format.ts"
import { calculateAccountBalance } from "@shared/helpers/account-balance.ts"
import { TransactionType } from "@shared/types"

export const analyticsHandler: QueryHandler<AnalyticsQuery> = async (
  query: AnalyticsQuery,
): Promise<AnalyticsResult> => {
  const { userId } = query.data

  // Get data in parallel
  const [transactions, categories, accounts, currencies] = await Promise.all([
    db.transaction.findMany({ filter: { userId } }),
    db.category.findMany(userId),
    db.account.findMany(userId),
    db.currency.findMany(),
  ])

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
