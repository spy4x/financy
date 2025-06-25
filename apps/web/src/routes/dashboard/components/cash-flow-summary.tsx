import { useComputed } from "@preact/signals"
import { transaction } from "../../../state/transaction.ts"
import { group } from "../../../state/group.ts"
import { CurrencyDisplay } from "../../../components/ui/CurrencyDisplay.tsx"
import { TransactionType } from "@shared/types"

export function CashFlowSummary() {
  // Get current month transactions
  const currentMonthTransactions = useComputed(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    return transaction.list.value
      .filter((txn) => {
        const txnDate = new Date(txn.createdAt)
        return (
          txn.groupId === group.selectedId.value &&
          txnDate >= startOfMonth &&
          txnDate <= endOfMonth &&
          !txn.deletedAt
        )
      })
  })

  // Get previous month transactions for comparison
  const previousMonthTransactions = useComputed(() => {
    const now = new Date()
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    return transaction.list.value
      .filter((txn) => {
        const txnDate = new Date(txn.createdAt)
        return (
          txn.groupId === group.selectedId.value &&
          txnDate >= startOfPrevMonth &&
          txnDate <= endOfPrevMonth &&
          !txn.deletedAt
        )
      })
  })

  // Calculate current month metrics
  const currentMonthIncome = useComputed(() =>
    currentMonthTransactions.value
      .filter((txn) => txn.type === TransactionType.CREDIT)
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const currentMonthExpenses = useComputed(() =>
    currentMonthTransactions.value
      .filter((txn) => txn.type === TransactionType.DEBIT)
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const currentNetFlow = useComputed(() => currentMonthIncome.value - currentMonthExpenses.value)

  // Calculate previous month metrics for comparison
  const previousMonthIncome = useComputed(() =>
    previousMonthTransactions.value
      .filter((txn) => txn.type === TransactionType.CREDIT)
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const previousMonthExpenses = useComputed(() =>
    previousMonthTransactions.value
      .filter((txn) => txn.type === TransactionType.DEBIT)
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const previousNetFlow = useComputed(() => previousMonthIncome.value - previousMonthExpenses.value)

  // Calculate percentage changes
  const incomeChange = useComputed(() => {
    if (previousMonthIncome.value === 0) return currentMonthIncome.value > 0 ? 100 : 0
    return ((currentMonthIncome.value - previousMonthIncome.value) / previousMonthIncome.value) *
      100
  })

  const expenseChange = useComputed(() => {
    if (previousMonthExpenses.value === 0) return currentMonthExpenses.value > 0 ? 100 : 0
    return ((currentMonthExpenses.value - previousMonthExpenses.value) /
      previousMonthExpenses.value) * 100
  })

  const netFlowChange = useComputed(() => {
    if (previousNetFlow.value === 0) {
      if (currentNetFlow.value > 0) return 100
      if (currentNetFlow.value < 0) return -100
      return 0
    }
    return ((currentNetFlow.value - previousNetFlow.value) / Math.abs(previousNetFlow.value)) * 100
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => {
    const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
    return selectedGroup?.defaultCurrency || "USD"
  })

  const formatPercentageChange = (change: number) => {
    const isPositive = change >= 0
    const sign = isPositive ? "+" : ""
    return {
      value: `${sign}${change.toFixed(1)}%`,
      className: isPositive ? "text-green-600" : "text-red-600",
    }
  }

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const previousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    .toLocaleDateString("en-US", { month: "long" })

  return (
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-medium text-gray-900">Cash Flow Summary</h3>
        <p class="text-sm text-gray-600">{currentMonth} vs {previousMonth}</p>
      </div>
      <div class="card-body">
        <div class="space-y-6">
          {/* Income */}
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700">Income</span>
                <div class="text-right">
                  <div class="text-lg font-semibold text-green-600">
                    <CurrencyDisplay
                      amount={currentMonthIncome.value}
                      currency={defaultCurrency.value}
                    />
                  </div>
                  <div class={`text-xs ${formatPercentageChange(incomeChange.value).className}`}>
                    {formatPercentageChange(incomeChange.value).value}
                  </div>
                </div>
              </div>
              {/* Visual bar for income */}
              <div class="mt-2 bg-gray-200 rounded-full h-2">
                <div
                  class="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      Math.min(
                        100,
                        Math.max(
                          0,
                          (currentMonthIncome.value /
                            Math.max(currentMonthIncome.value, currentMonthExpenses.value, 1)) *
                            100,
                        ),
                      )
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700">Expenses</span>
                <div class="text-right">
                  <div class="text-lg font-semibold text-red-600">
                    <CurrencyDisplay
                      amount={-currentMonthExpenses.value}
                      currency={defaultCurrency.value}
                    />
                  </div>
                  <div class={`text-xs ${formatPercentageChange(expenseChange.value).className}`}>
                    {formatPercentageChange(expenseChange.value).value}
                  </div>
                </div>
              </div>
              {/* Visual bar for expenses */}
              <div class="mt-2 bg-gray-200 rounded-full h-2">
                <div
                  class="bg-red-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      Math.min(
                        100,
                        Math.max(
                          0,
                          (currentMonthExpenses.value /
                            Math.max(currentMonthIncome.value, currentMonthExpenses.value, 1)) *
                            100,
                        ),
                      )
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Net Cash Flow */}
          <div class="border-t pt-4">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700">Net Cash Flow</span>
              <div class="text-right">
                <div
                  class={`text-lg font-semibold ${
                    currentNetFlow.value >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  <CurrencyDisplay
                    amount={currentNetFlow.value}
                    currency={defaultCurrency.value}
                  />
                </div>
                <div class={`text-xs ${formatPercentageChange(netFlowChange.value).className}`}>
                  {formatPercentageChange(netFlowChange.value).value}
                </div>
              </div>
            </div>

            {/* Net flow visualization */}
            <div class="mt-3">
              <div class="flex items-center space-x-2 text-xs text-gray-500 mb-1">
                <span>Loss</span>
                <div class="flex-1" />
                <span>Gain</span>
              </div>
              <div class="relative bg-gray-200 rounded-full h-3">
                {/* Zero line indicator */}
                <div class="absolute left-1/2 transform -translate-x-px bg-gray-400 h-3 w-0.5 rounded-full" />

                {/* Net flow indicator */}
                {currentNetFlow.value !== 0 && (
                  <div
                    class={`absolute h-3 rounded-full transition-all duration-300 ${
                      currentNetFlow.value >= 0 ? "bg-green-500" : "bg-red-500"
                    }`}
                    style={{
                      [currentNetFlow.value >= 0 ? "left" : "right"]: "50%",
                      width: `${
                        Math.min(
                          50,
                          Math.abs(currentNetFlow.value) /
                            Math.max(currentMonthIncome.value, currentMonthExpenses.value, 1) * 50,
                        )
                      }%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
