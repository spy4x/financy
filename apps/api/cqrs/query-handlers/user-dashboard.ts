import { QueryHandler } from "@shared/cqrs/types.ts"
import { UserDashboardQuery, UserDashboardResult } from "../queries.ts"
import { accountListHandler } from "./account-list.ts"
import { transactionListHandler } from "./transaction-list.ts"
import { categoryListHandler } from "./category-list.ts"
import { analyticsHandler } from "./analytics.ts"
import {
  AccountListQuery,
  AnalyticsQuery,
  CategoryListQuery,
  TransactionListQuery,
} from "../queries.ts"

export const userDashboardHandler: QueryHandler<UserDashboardQuery> = async (
  query: UserDashboardQuery,
): Promise<UserDashboardResult> => {
  const { userId } = query.data

  // Execute all queries in parallel for efficiency
  const [accounts, recentTransactions, categories, analytics] = await Promise.all([
    accountListHandler(new AccountListQuery({ userId })),
    transactionListHandler(new TransactionListQuery({ userId, limit: 10 })),
    categoryListHandler(new CategoryListQuery({ userId })),
    analyticsHandler(new AnalyticsQuery({ userId })),
  ])

  return {
    accounts,
    recentTransactions,
    categories,
    analytics,
  }
}
