import { QueryHandler } from "@shared/cqrs/types.ts"
import { CategoryListQuery, CategoryListResult } from "../queries.ts"
import { db } from "@api/services/db.ts"
import { formatMoney } from "@shared/helpers/format.ts"

export const categoryListHandler: QueryHandler<CategoryListQuery> = async (
  query: CategoryListQuery,
): Promise<CategoryListResult> => {
  const { userId, type } = query.data

  // Get categories, transactions, and currencies in parallel
  const [categories, transactions, currencies] = await Promise.all([
    db.category.findMany(userId),
    db.transaction.findMany({ filter: { userId } }),
    db.currency.findMany(),
  ])

  const currencyMap = new Map(currencies.map((c) => [c.id, c]))

  // Filter categories by type if specified
  const filteredCategories = type ? categories.filter((cat) => cat.type === type) : categories

  // Calculate current month range
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  // Filter transactions for current month
  const monthlyTransactions = transactions.filter((txn) => {
    const txnDate = new Date(txn.timestamp)
    return txnDate >= startOfMonth && txnDate <= endOfMonth
  })

  const categoriesWithUsage = filteredCategories.map((category) => {
    // Calculate monthly usage for this category
    const categoryTransactions = monthlyTransactions.filter((txn) => txn.categoryId === category.id)
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
