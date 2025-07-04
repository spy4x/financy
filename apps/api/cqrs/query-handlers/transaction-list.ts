import { QueryHandler } from "@shared/cqrs/types.ts"
import { TransactionListQuery, TransactionListResult } from "../queries.ts"
import { db } from "@api/services/db.ts"
import { formatMoney } from "@shared/helpers/format.ts"
import { TransactionDirection } from "@shared/types"

export const transactionListHandler: QueryHandler<TransactionListQuery> = async (
  query: TransactionListQuery,
): Promise<TransactionListResult> => {
  const { userId, limit = 10, offset = 0, timeRange } = query.data

  // Build filter with timeRange support
  const filter: { userId: number; timestamp?: { gte?: Date; lte?: Date } } = { userId }
  if (timeRange) {
    filter.timestamp = {}
    if (timeRange.gte) filter.timestamp.gte = timeRange.gte
    if (timeRange.lte) filter.timestamp.lte = timeRange.lte
  }

  // Get user's transactions with pagination and time filtering
  const transactions = await db.transaction.findMany({
    filter,
    pagination: { limit, offset },
  })

  if (transactions.length === 0) {
    return {
      transactions: [],
    }
  }

  // Get related data for display in parallel
  const [accounts, categories, currencies] = await Promise.all([
    db.account.findMany(userId),
    db.category.findMany(userId),
    db.currency.findMany(),
  ])

  // Create lookup maps
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const currencyMap = new Map(currencies.map((c) => [c.id, c]))

  // Transform transactions to expected format
  const formattedTransactions = transactions.map((txn) => {
    const account = accountMap.get(txn.accountId)
    const category = categoryMap.get(txn.categoryId || 0)
    const currency = currencyMap.get(account?.currencyId || 0)

    return {
      id: txn.id,
      accountName: account?.name || "Unknown",
      categoryName: category?.name,
      formattedAmount: formatMoney(Math.abs(txn.amount), currency?.code || "USD"),
      direction: txn.direction || TransactionDirection.MONEY_OUT,
      type: txn.type,
      memo: txn.memo,
      timestamp: txn.timestamp.toISOString(),
    }
  })

  return {
    transactions: formattedTransactions,
  }
}
