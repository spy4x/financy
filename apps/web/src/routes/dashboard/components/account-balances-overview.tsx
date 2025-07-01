import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { account } from "../../../state/account.ts"
import { group } from "../../../state/group.ts"
import { currency } from "../../../state/currency.ts"
import { CurrencyDisplay } from "../../../components/ui/CurrencyDisplay.tsx"
import { IconHome } from "@client/icons"

export function AccountBalancesOverview() {
  // Get accounts for selected group
  const groupAccounts = useComputed(() =>
    account.list.value
      .filter((acc) => acc.groupId === group.selectedId.value && !acc.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
  )

  // Calculate total balance across all accounts (converted to group's default currency)
  const totalBalance = useComputed(() =>
    groupAccounts.value.reduce((sum, acc) => sum + account.getCurrentBalance(acc.id), 0)
  )

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
              <p class="text-sm text-gray-600 mb-1">Total Balance</p>
              <CurrencyDisplay
                amount={totalBalance.value}
                currency={defaultCurrency.value.id}
                class={`text-2xl font-bold ${
                  totalBalance.value >= 0 ? "text-green-600" : "text-red-600"
                }`}
                highlightNegative={totalBalance.value < 0}
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
              const currentBalance = account.getCurrentBalance(acc.id)
              return (
                <Link
                  key={acc.id}
                  href={`/transactions?accountId=${acc.id}`}
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
                      amount={currentBalance}
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
