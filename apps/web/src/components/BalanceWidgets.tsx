import { useComputed } from "@preact/signals"
import {
  AccountBalanceSummary,
  MultiCurrencyAccountBalance,
} from "./ui/MultiCurrencyAccountBalance.tsx"
import { CurrencyDisplay } from "./ui/CurrencyDisplay.tsx"
import { IconTrendingDown, IconTrendingUp } from "@client/icons"
import { account } from "@web/state/account.ts"
import { transaction } from "@web/state/transaction.ts"
import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import type { Account } from "@shared/types"

interface AccountBalanceWidgetProps {
  /** Account to display balance for */
  account: Account
  /** Whether to show detailed breakdown */
  showDetails?: boolean
  /** Whether to show trends */
  showTrends?: boolean
  /** Additional CSS classes */
  class?: string
}

/**
 * AccountBalanceWidget - Enhanced account balance display with multi-currency support
 *
 * Features:
 * - Current balance in account currency
 * - Conversion to group base currency
 * - Balance trends (increase/decrease)
 * - Starting balance comparison
 * - Responsive design
 */
export function AccountBalanceWidget({
  account: accountData,
  showDetails = true,
  showTrends = false,
  class: className = "",
}: AccountBalanceWidgetProps) {
  // Calculate current balance from transactions
  const currentBalance = useComputed(() => {
    const accountTransactions = transaction.list.value.filter(
      (t) => t.accountId === accountData.id && !t.deletedAt,
    )

    return accountTransactions.reduce(
      (balance, txn) => balance + txn.amount,
      accountData.startingBalance,
    )
  })

  // Calculate balance change since starting balance
  const balanceChange = useComputed(() => currentBalance.value - accountData.startingBalance)

  // Get trend direction
  const trend = useComputed(() => {
    const change = balanceChange.value
    if (change > 0) return "up"
    if (change < 0) return "down"
    return "neutral"
  })

  // Get group base currency for conversion
  const groupBaseCurrency = useComputed(() => {
    const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
    return selectedGroup?.currencyId || 1
  })

  return (
    <div
      class={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${className}`}
    >
      {/* Account Header */}
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {accountData.name}
          </h3>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {currency.getById(accountData.currencyId).code} Account
          </div>
        </div>

        {showTrends && balanceChange.value !== 0 && (
          <div
            class={`flex items-center text-sm ${
              trend.value === "up"
                ? "text-green-600 dark:text-green-400"
                : trend.value === "down"
                ? "text-red-600 dark:text-red-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {trend.value === "up" && <IconTrendingUp class="w-4 h-4 mr-1" />}
            {trend.value === "down" && <IconTrendingDown class="w-4 h-4 mr-1" />}
            {trend.value === "neutral" && <span class="w-4 h-4 mr-1 text-center">−</span>}
            <CurrencyDisplay
              amount={Math.abs(balanceChange.value)}
              currency={accountData.currencyId}
            />
          </div>
        )}
      </div>

      {/* Balance Display */}
      <MultiCurrencyAccountBalance
        account={accountData}
        currentBalance={currentBalance.value}
        showInBaseCurrency={accountData.currencyId !== groupBaseCurrency.value}
        groupBaseCurrencyId={groupBaseCurrency.value}
        showBothCurrencies
        highlightNegative
        class="mb-4"
      />

      {/* Details Section */}
      {showDetails && (
        <div class="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          {/* Starting Balance */}
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-600 dark:text-gray-400">Starting Balance:</span>
            <CurrencyDisplay
              amount={accountData.startingBalance}
              currency={accountData.currencyId}
              class="text-gray-700 dark:text-gray-300"
            />
          </div>

          {/* Balance Change */}
          {balanceChange.value !== 0 && (
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-600 dark:text-gray-400">
                {balanceChange.value > 0 ? "Increase:" : "Decrease:"}
              </span>
              <CurrencyDisplay
                amount={Math.abs(balanceChange.value)}
                currency={accountData.currencyId}
                class={balanceChange.value > 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"}
              />
            </div>
          )}

          {/* Conversion Info */}
          {accountData.currencyId !== groupBaseCurrency.value && (
            <div class="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
              Exchange rates updated: {new Date().toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface GroupBalanceOverviewProps {
  /** Group ID to show balances for */
  groupId?: number
  /** Additional CSS classes */
  class?: string
}

/**
 * GroupBalanceOverview - Multi-currency balance summary for all accounts in a group
 *
 * Features:
 * - Total balance across all accounts in base currency
 * - Individual account balances
 * - Currency breakdown
 * - Responsive grid layout
 */
export function GroupBalanceOverview({
  groupId,
  class: className = "",
}: GroupBalanceOverviewProps) {
  const selectedGroupId = groupId || group.selectedId.value

  // Get accounts for the selected group
  const groupAccounts = useComputed(() =>
    account.list.value.filter((a) => a.groupId === selectedGroupId && !a.deletedAt)
  )

  // Calculate balances for each account
  const accountsWithBalances = useComputed(() =>
    groupAccounts.value.map((acc) => {
      const accountTransactions = transaction.list.value.filter(
        (t) => t.accountId === acc.id && !t.deletedAt,
      )

      const balance = accountTransactions.reduce(
        (total, txn) => total + txn.amount,
        acc.startingBalance,
      )

      return { account: acc, balance }
    })
  )

  // Get group base currency
  const groupBaseCurrency = useComputed(() => {
    const selectedGroup = group.list.value.find((g) => g.id === selectedGroupId)
    return selectedGroup?.currencyId || 1
  })

  if (groupAccounts.value.length === 0) {
    return (
      <div class={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
        No accounts found for this group.
      </div>
    )
  }

  return (
    <div class={`space-y-6 ${className}`}>
      {/* Total Balance Summary */}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Total Balance
        </h2>
        <AccountBalanceSummary
          accounts={accountsWithBalances.value}
          groupBaseCurrencyId={groupBaseCurrency.value}
        />
      </div>

      {/* Individual Account Balances */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accountsWithBalances.value.map(({ account: acc }) => (
          <AccountBalanceWidget
            key={acc.id}
            account={acc}
            showDetails={false}
            showTrends
          />
        ))}
      </div>
    </div>
  )
}
