import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { navigate } from "@client/helpers"
import { account } from "../../../state/account.ts"
import { group } from "../../../state/group.ts"
import { CurrencyDisplay } from "../../../components/ui/CurrencyDisplay.tsx"
import { IconHome, IconPlus } from "@client/icons"

export function AccountBalancesOverview() {
  // Get accounts for selected group
  const groupAccounts = useComputed(() =>
    account.list.value
      .filter((acc) => acc.groupId === group.selectedId.value && !acc.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
  )

  // Calculate total balance across all accounts (converted to group's default currency)
  const totalBalance = useComputed(() =>
    groupAccounts.value.reduce((sum, acc) => sum + acc.balance, 0)
  )

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => {
    const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
    return selectedGroup?.defaultCurrency || "USD"
  })

  // Categorize accounts by balance status
  const categorizedAccounts = useComputed(() => {
    const accounts = groupAccounts.value
    return {
      positive: accounts.filter((acc) => acc.balance > 0),
      zero: accounts.filter((acc) => acc.balance === 0),
      negative: accounts.filter((acc) => acc.balance < 0),
    }
  })

  const handleAccountClick = (accountId: number) => {
    navigate(`/accounts/${accountId}`)
  }

  if (groupAccounts.value.length === 0) {
    return (
      <div>
        <h2 class="text-lg font-medium text-gray-900 mb-4">Account Balances</h2>
        <div class="card">
          <div class="card-body text-center py-8">
            <IconHome class="size-12 text-gray-400 mx-auto mb-4" />
            <p class="text-gray-500 mb-4">No accounts created yet</p>
            <p class="text-sm text-gray-400 mb-4">
              Create your first account to start tracking your finances.
            </p>
            {group.selectedId.value
              ? (
                <Link
                  href="/accounts/create"
                  class="btn btn-primary"
                >
                  <IconPlus class="size-4 mr-2" />
                  Add Account
                </Link>
              )
              : (
                <div class="btn btn-disabled cursor-not-allowed">
                  <IconPlus class="size-4 mr-2" />
                  Add Account
                </div>
              )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-gray-900">Account Balances</h2>
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
                currency={defaultCurrency.value}
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
              const isPositive = acc.balance > 0
              const isZero = acc.balance === 0
              const isNegative = acc.balance < 0

              return (
                <div
                  key={acc.id}
                  class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleAccountClick(acc.id)}
                >
                  <div class="flex items-center space-x-3">
                    <div
                      class={`
                      w-3 h-3 rounded-full
                      ${isPositive ? "bg-green-500" : isZero ? "bg-yellow-500" : "bg-red-500"}
                    `}
                    />
                    <div>
                      <p class="text-sm font-medium text-gray-900">
                        {acc.name}
                      </p>
                      <p class="text-xs text-gray-500">
                        {acc.currency}
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <CurrencyDisplay
                      amount={acc.balance}
                      currency={acc.currency}
                      class={`text-sm font-medium ${
                        isPositive ? "text-green-600" : isZero ? "text-gray-600" : "text-red-600"
                      }`}
                      highlightNegative={isNegative}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Account Status Summary */}
          {(categorizedAccounts.value.negative.length > 0 ||
            categorizedAccounts.value.zero.length > 0) && (
            <div class="mt-6 pt-4 border-t border-gray-200">
              <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p class="text-xs text-gray-500">Positive</p>
                  <p class="text-sm font-medium text-green-600">
                    {categorizedAccounts.value.positive.length}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">Zero</p>
                  <p class="text-sm font-medium text-yellow-600">
                    {categorizedAccounts.value.zero.length}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-gray-500">Negative</p>
                  <p class="text-sm font-medium text-red-600">
                    {categorizedAccounts.value.negative.length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Add Account Button */}
          <div class="mt-4 pt-4 border-t border-gray-200">
            <Link
              href="/accounts/create"
              class="btn btn-sm btn-primary-outline w-full"
            >
              <IconPlus class="size-4 mr-2" />
              Add Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
