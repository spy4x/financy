import { QueryHandler } from "@shared/cqrs/types.ts"
import { AccountListQuery, AccountListResult } from "../queries.ts"
import { db } from "@api/services/db.ts"
import { formatMoney } from "@shared/helpers/format.ts"
import { calculateAccountBalance } from "@shared/helpers/account-balance.ts"

export const accountListHandler: QueryHandler<AccountListQuery> = async (
  query: AccountListQuery,
): Promise<AccountListResult> => {
  const { userId } = query.data

  // Get user's accounts first
  const accounts = await db.account.findMany(userId)

  if (accounts.length === 0) {
    return {
      accounts: [],
      currencies: new Map(),
      formatAccountBalance: () => "$0.00",
    }
  }

  // Get currencies and transactions in parallel
  const [currencies, transactions] = await Promise.all([
    db.currency.findMany(),
    db.transaction.findMany({ filter: { userId } }),
  ])

  const currencyMap = new Map(currencies.map((c) => [c.id, c]))

  // Create balance formatter function
  const formatAccountBalance = (accountId: number): string => {
    const account = accounts.find((a) => a.id === accountId)
    if (!account) return "$0.00"

    const currency = currencyMap.get(account.currencyId)
    const balance = calculateAccountBalance(account, transactions)

    return formatMoney(balance, currency?.code || "USD")
  }

  return {
    accounts,
    currencies: currencyMap,
    formatAccountBalance,
  }
}
