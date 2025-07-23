import { useComputed } from "@preact/signals"
import { GroupBalanceOverview } from "./BalanceWidgets.tsx"
import { CurrencyDisplay } from "./ui/CurrencyDisplay.tsx"
import { IconArrowRight } from "@client/icons"
import { account } from "@web/state/account.ts"
import { transaction } from "@web/state/transaction.ts"
import { currency } from "@web/state/currency.ts"
import { exchangeRate } from "@web/state/exchange-rate.ts"
import { group } from "@web/state/group.ts"
import { convertAmount } from "@shared/helpers/currency.ts"
import type { Transaction as _Transaction } from "@shared/types"

interface MultiCurrencyDashboardProps {
  /** Group ID to show dashboard for */
  groupId?: number
  /** Additional CSS classes */
  class?: string
}

/**
 * MultiCurrencyDashboard - Comprehensive dashboard with multi-currency insights
 *
 * Features:
 * - Total balance across all currencies
 * - Currency breakdown with percentages
 * - Recent cross-currency transactions
 * - Exchange rate trends
 * - Quick currency conversion tool
 */
export function MultiCurrencyDashboard({
  groupId,
  class: className = "",
}: MultiCurrencyDashboardProps) {
  const selectedGroupId = groupId || group.selectedId.value

  // Get group accounts
  const groupAccounts = useComputed(() =>
    account.list.value.filter((a) => a.groupId === selectedGroupId && !a.deletedAt)
  )

  // Get group base currency
  const groupBaseCurrency = useComputed(() => {
    const selectedGroup = group.list.value.find((g) => g.id === selectedGroupId)
    return selectedGroup?.currencyId || 1
  })

  // Calculate balances by currency
  const currencyBalances = useComputed(() => {
    const balances = new Map<number, { currency: number; balance: number; accounts: number }>()

    groupAccounts.value.forEach((acc) => {
      const accountTransactions = transaction.list.value.filter(
        (t) => t.accountId === acc.id && !t.deletedAt,
      )

      const balance = accountTransactions.reduce(
        (total, txn) => total + txn.amount,
        acc.startingBalance,
      )

      const existing = balances.get(acc.currencyId)
      if (existing) {
        existing.balance += balance
        existing.accounts += 1
      } else {
        balances.set(acc.currencyId, {
          currency: acc.currencyId,
          balance,
          accounts: 1,
        })
      }
    })

    return Array.from(balances.values()).sort((a, b) => {
      const currA = currency.getById(a.currency)
      const currB = currency.getById(b.currency)
      return currA.code.localeCompare(currB.code)
    })
  })

  // Convert all balances to base currency for total
  const totalBalanceInBaseCurrency = useComputed(() => {
    let total = 0
    const rates = exchangeRate.getAll()

    currencyBalances.value.forEach(({ currency: currencyId, balance }) => {
      try {
        if (currencyId === groupBaseCurrency.value) {
          total += balance
        } else {
          const converted = convertAmount(balance, currencyId, groupBaseCurrency.value, rates)
          total += converted
        }
      } catch (error) {
        console.warn(`Failed to convert balance for currency ${currencyId}:`, error)
      }
    })

    return total
  })

  // Recent cross-currency transactions
  const recentCrossCurrencyTransactions = useComputed(() => {
    const recent = transaction.list.value
      .filter((t) => !t.deletedAt && t.originalCurrencyId && t.originalCurrencyId !== t.accountId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)

    return recent.map((txn) => {
      const acc = account.list.value.find((a) => a.id === txn.accountId)
      return {
        transaction: txn,
        account: acc,
        originalCurrency: txn.originalCurrencyId ? currency.getById(txn.originalCurrencyId) : null,
        accountCurrency: acc ? currency.getById(acc.currencyId) : null,
      }
    })
  })

  // Currency diversity metrics
  const currencyMetrics = useComputed(() => {
    const totalAccounts = groupAccounts.value.length
    const uniqueCurrencies = currencyBalances.value.length
    const diversityPercentage = totalAccounts > 0 ? (uniqueCurrencies / totalAccounts) * 100 : 0

    return {
      totalAccounts,
      uniqueCurrencies,
      diversityPercentage: Math.round(diversityPercentage),
      isMultiCurrency: uniqueCurrencies > 1,
    }
  })

  if (groupAccounts.value.length === 0) {
    return (
      <div class={`text-center py-12 text-gray-500 dark:text-gray-400 ${className}`}>
        <div class="w-16 h-16 mx-auto mb-4 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center opacity-50">
          <span class="text-2xl">💰</span>
        </div>
        <h3 class="text-lg font-medium mb-2">No accounts found</h3>
        <p>Create your first account to get started with multi-currency tracking.</p>
      </div>
    )
  }

  return (
    <div class={`space-y-6 ${className}`}>
      {/* Header Stats */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Balance */}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div class="flex items-center">
            <div class="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mr-3">
              <span class="text-blue-600 dark:text-blue-400">💰</span>
            </div>
            <div>
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Balance</p>
              <CurrencyDisplay
                amount={totalBalanceInBaseCurrency.value}
                currency={groupBaseCurrency.value}
                class="text-2xl font-bold text-gray-900 dark:text-gray-100"
                highlightNegative
              />
            </div>
          </div>
        </div>

        {/* Currency Diversity */}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div class="flex items-center">
            <div class="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mr-3">
              <span class="text-green-600 dark:text-green-400">🌍</span>
            </div>
            <div>
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Currency Diversity</p>
              <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {currencyMetrics.value.uniqueCurrencies} / {currencyMetrics.value.totalAccounts}
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {currencyMetrics.value.diversityPercentage}% diversity
              </p>
            </div>
          </div>
        </div>

        {/* Active Currencies */}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Active Currencies</p>
          <div class="flex flex-wrap gap-2">
            {currencyBalances.value.map(({ currency: currencyId }) => {
              const curr = currency.getById(currencyId)
              return (
                <span
                  key={currencyId}
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                >
                  {curr.symbol || curr.code}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Currency Breakdown */}
      {currencyMetrics.value.isMultiCurrency && (
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Balance by Currency
          </h3>
          <div class="space-y-4">
            {currencyBalances.value.map(({ currency: currencyId, balance, accounts }) => {
              const curr = currency.getById(currencyId)
              const isBaseCurrency = currencyId === groupBaseCurrency.value

              return (
                <div
                  key={currencyId}
                  class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div class="flex items-center">
                    <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mr-4">
                      <span class="text-sm font-bold text-blue-600 dark:text-blue-400">
                        {curr.symbol || curr.code.slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p class="font-medium text-gray-900 dark:text-gray-100">
                        {curr.name}
                        {isBaseCurrency && (
                          <span class="ml-2 text-xs text-blue-600 dark:text-blue-400">(Base)</span>
                        )}
                      </p>
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        {accounts} {accounts === 1 ? "account" : "accounts"}
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <CurrencyDisplay
                      amount={balance}
                      currency={currencyId}
                      class="font-semibold"
                      highlightNegative
                    />
                    {!isBaseCurrency && totalBalanceInBaseCurrency.value !== 0 && (
                      <div class="text-sm text-gray-500 dark:text-gray-400">
                        ≈{" "}
                        <CurrencyDisplay
                          amount={convertAmount(
                            balance,
                            currencyId,
                            groupBaseCurrency.value,
                            exchangeRate.getAll(),
                          )}
                          currency={groupBaseCurrency.value}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Cross-Currency Transactions */}
      {recentCrossCurrencyTransactions.value.length > 0 && (
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Recent Multi-Currency Transactions
          </h3>
          <div class="space-y-3">
            {recentCrossCurrencyTransactions.value.map((
              { transaction: txn, account: acc, originalCurrency, accountCurrency },
            ) => (
              <div
                key={txn.id}
                class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div class="flex items-center">
                  <div class="mr-4">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {txn.memo || "Transaction"}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {acc?.name} • {new Date(txn.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div class="flex items-center text-sm">
                  {originalCurrency && (
                    <>
                      <CurrencyDisplay
                        amount={Math.abs(txn.originalAmount || 0)}
                        currency={originalCurrency.id}
                        class="text-gray-600 dark:text-gray-400"
                      />
                      <IconArrowRight class="w-4 h-4 mx-2 text-gray-400" />
                    </>
                  )}
                  <CurrencyDisplay
                    amount={Math.abs(txn.amount)}
                    currency={accountCurrency?.id || 1}
                    class="font-medium"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balance Overview */}
      <GroupBalanceOverview groupId={selectedGroupId} />
    </div>
  )
}
