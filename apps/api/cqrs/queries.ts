import { Query } from "@shared/cqrs/types.ts"
import {
  Account,
  CategoryType,
  Currency,
  Group,
  GroupMembership,
  TransactionDirection,
  TransactionType,
  UserSettings,
} from "@shared/types"

// #region Group Queries

export interface UserGroupsPayload {
  userId: number
}

export interface UserGroupsResult {
  groups: Group[]
  memberships: GroupMembership[]
}

export class UserGroupsQuery implements Query<UserGroupsPayload, UserGroupsResult> {
  __resultType?: UserGroupsResult
  constructor(public data: UserGroupsPayload) {}
}

// #endregion Group Queries

// #region Account Queries

export interface AccountListPayload {
  userId: number
}

export interface AccountListResult {
  accounts: Account[]
  currencies: Map<number, Currency>
  formatAccountBalance: (accountId: number) => string
}

export class AccountListQuery implements Query<AccountListPayload, AccountListResult> {
  __resultType?: AccountListResult
  constructor(public data: AccountListPayload) {}
}

// #endregion Account Queries

// #region Transaction Queries

export interface TransactionListPayload {
  userId: number
  limit?: number
  offset?: number
  timeRange?: {
    gte?: Date
    lte?: Date
  }
}

export interface TransactionListResult {
  transactions: Array<{
    id: number
    accountName: string
    categoryName?: string
    formattedAmount: string
    direction: TransactionDirection
    type: TransactionType
    memo: string | null
    timestamp: string
  }>
}

export class TransactionListQuery implements Query<TransactionListPayload, TransactionListResult> {
  __resultType?: TransactionListResult
  constructor(public data: TransactionListPayload) {}
}

// #endregion Transaction Queries

// #region Category Queries

export interface CategoryListPayload {
  userId: number
  type?: CategoryType
}

export interface CategoryListResult {
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
}

export class CategoryListQuery implements Query<CategoryListPayload, CategoryListResult> {
  __resultType?: CategoryListResult
  constructor(public data: CategoryListPayload) {}
}

// #endregion Category Queries

// #region Analytics Queries

export interface AnalyticsPayload {
  userId: number
}

export interface AnalyticsResult {
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
}

export class AnalyticsQuery implements Query<AnalyticsPayload, AnalyticsResult> {
  __resultType?: AnalyticsResult
  constructor(public data: AnalyticsPayload) {}
}

// #endregion Analytics Queries

// #region User Dashboard Query (combines multiple data sources)

export interface UserDashboardPayload {
  userId: number
}

export interface UserDashboardResult {
  accounts: AccountListResult
  recentTransactions: TransactionListResult
  categories: CategoryListResult
  analytics: AnalyticsResult
}

export class UserDashboardQuery implements Query<UserDashboardPayload, UserDashboardResult> {
  __resultType?: UserDashboardResult
  constructor(public data: UserDashboardPayload) {}
}

// #endregion User Dashboard Query

// #region User Settings Queries

export interface UserSettingsGetPayload {
  userId: number
}

export interface UserSettingsGetResult {
  settings: UserSettings | null
}

export class UserSettingsGetQuery implements Query<UserSettingsGetPayload, UserSettingsGetResult> {
  __resultType?: UserSettingsGetResult
  constructor(public data: UserSettingsGetPayload) {}
}

// #endregion User Settings Queries
