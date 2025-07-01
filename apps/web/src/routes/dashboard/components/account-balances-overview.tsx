import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { account } from "@web/state/account.ts"
import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { transaction } from "@web/state/transaction.ts"
import { dashboard } from "@web/state/dashboard.ts"

function getDateRangeQuery() {
  const { startDate, endDate } = dashboard.current
  return `from=${encodeURIComponent(startDate.toISOString())}&to=${
    encodeURIComponent(endDate.toISOString())
  }`
}
import { CurrencyDisplay } from "../../../components/ui/CurrencyDisplay.tsx"
import { IconHome } from "@client/icons"

export function AccountBalancesOverview() {
  // Get accounts for selected group
  const groupAccounts = useComputed(() =>
    account.list.value
      .filter((acc) => acc.groupId === group.selectedId.value && !acc.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
  )

  // Calculate total balance as of the selected date range end
  const totalBalanceAtRangeEnd = useComputed(() => {
    const range = dashboard.current
    return groupAccounts.value.reduce((sum, acc) => {
      // Get balance as of range end date
      const balanceAtDate = transaction.list.value.reduce((txnSum, txn) => {
        if (txn.accountId === acc.id && !txn.deletedAt) {
          const txnDate = new Date(txn.timestamp)
          // Only include transactions up to the range end date
          if (txnDate <= range.endDate) {
            return txnSum + txn.amount
          }
        }
        return txnSum
      }, acc.startingBalance)

      return sum + balanceAtDate
    }, 0)
  })

  // Function to get individual account balance as of range end date
  const getAccountBalanceAtRangeEnd = (accountId: number) => {
    const range = dashboard.current
    const acc = groupAccounts.value.find((a) => a.id === accountId)
    if (!acc) return 0

    return transaction.list.value.reduce((sum, txn) => {
      if (txn.accountId === accountId && !txn.deletedAt) {
        const txnDate = new Date(txn.timestamp)
        // Only include transactions up to the range end date
        if (txnDate <= range.endDate) {
          return sum + txn.amount
        }
      }
      return sum
    }, acc.startingBalance)
  }

  // Get balance description based on selected date range
  const balanceDescription = useComputed(() => {
    const range = dashboard.current
    const now = new Date()

    // Check if it's current date
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    if (range.endDate.getTime() >= today.getTime()) {
      return "Current balance"
    }

    return `Balance as of ${
      range.endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: range.endDate.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      })
    }`
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => group.getSelectedCurrency())

  // ...existing code...

  // ...existing code...

  if (groupAccounts.value.length === 0) {
    return (
      <div>
        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Account Balances</h2>
        <div class="card">
          <div class="card-body text-center py-8">
            <IconHome class="size-12 text-gray-400 mx-auto mb-4" />
            <p class="text-gray-500 mb-4">No accounts created yet</p>
            <p class="text-sm text-gray-400 mb-4">
              Create your first account to start tracking your finances.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">Account Balances</h2>
        <Link
          href="/accounts"
          class="btn btn-sm btn-primary-outline"
        >
          View All
        </Link>
      </div>

      <div class="card">
        <div class="card-body">
          {/* Total Balance Summary */}
          <div class="mb-6 p-4 bg-gray-50 rounded-lg">
            <div class="text-center">
              <p class="text-sm text-gray-600 mb-1">{balanceDescription.value}</p>
              <CurrencyDisplay
                amount={totalBalanceAtRangeEnd.value}
                currency={defaultCurrency.value.id}
                class={`text-2xl font-bold ${
                  totalBalanceAtRangeEnd.value >= 0 ? "text-green-600" : "text-red-600"
                }`}
                highlightNegative={totalBalanceAtRangeEnd.value < 0}
              />
              <p class="text-xs text-gray-500 mt-1">
                Across {groupAccounts.value.length}{" "}
                account{groupAccounts.value.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Individual Account List */}
          <div class="space-y-3">
            {groupAccounts.value.map((acc) => {
              const balanceAtRangeEnd = getAccountBalanceAtRangeEnd(acc.id)
              return (
                <Link
                  key={acc.id}
                  href={`/transactions?accountId=${acc.id}&${getDateRangeQuery()}`}
                  class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  title="View transactions for this account"
                >
                  <div class="flex items-center space-x-3">
                    <div>
                      <p class="text-sm font-medium text-gray-900">
                        {acc.name}
                      </p>
                      <p class="text-xs text-gray-500">
                        {currency.getById(acc.currencyId).code}
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <CurrencyDisplay
                      amount={balanceAtRangeEnd}
                      currency={acc.currencyId}
                      class="text-sm font-medium"
                    />
                  </div>
                </Link>
              )
            })}
          </div>

          {/* ...removed status summary and add account button... */}
        </div>
      </div>
    </div>
  )
}
