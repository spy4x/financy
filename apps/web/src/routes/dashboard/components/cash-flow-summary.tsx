import { useComputed } from "@preact/signals"
import { transaction } from "@web/state/transaction.ts"
import { group } from "@web/state/group.ts"
import { dashboard } from "@web/state/dashboard.ts"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { TransactionDirection, TransactionUtils } from "@shared/types"

export function CashFlowSummary() {
  // Get current range transactions
  const currentRangeTransactions = useComputed(() => {
    const range = dashboard.current
    return transaction.list.value
      .filter((txn) => {
        const txnDate = new Date(txn.timestamp)
        return (
          txn.groupId === group.selectedId.value &&
          txnDate >= range.startDate &&
          txnDate <= range.endDate &&
          !txn.deletedAt
        )
      })
  })

  // Get comparison period transactions (same duration, immediately before current range)
  const comparisonTransactions = useComputed(() => {
    const range = dashboard.current
    const rangeDuration = range.endDate.getTime() - range.startDate.getTime()
    const comparisonStart = new Date(range.startDate.getTime() - rangeDuration)
    const comparisonEnd = new Date(range.startDate.getTime() - 1) // Just before current range starts

    return transaction.list.value
      .filter((txn) => {
        const txnDate = new Date(txn.timestamp)
        return (
          txn.groupId === group.selectedId.value &&
          txnDate >= comparisonStart &&
          txnDate <= comparisonEnd &&
          !txn.deletedAt
        )
      })
  })

  // Calculate current range metrics
  const currentIncome = useComputed(() =>
    currentRangeTransactions.value
      .filter((txn) =>
        txn.direction === TransactionDirection.MONEY_IN &&
        TransactionUtils.affectsProfitLoss(txn.type)
      )
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const currentExpenses = useComputed(() =>
    currentRangeTransactions.value
      .filter((txn) =>
        txn.direction === TransactionDirection.MONEY_OUT &&
        TransactionUtils.affectsProfitLoss(txn.type)
      )
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const currentNetFlow = useComputed(() => currentIncome.value - currentExpenses.value)

  // Calculate comparison period metrics
  const comparisonIncome = useComputed(() =>
    comparisonTransactions.value
      .filter((txn) =>
        txn.direction === TransactionDirection.MONEY_IN &&
        TransactionUtils.affectsProfitLoss(txn.type)
      )
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const comparisonExpenses = useComputed(() =>
    comparisonTransactions.value
      .filter((txn) =>
        txn.direction === TransactionDirection.MONEY_OUT &&
        TransactionUtils.affectsProfitLoss(txn.type)
      )
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  const comparisonNetFlow = useComputed(() => comparisonIncome.value - comparisonExpenses.value)

  // Calculate percentage changes
  const incomeChange = useComputed(() => {
    if (comparisonIncome.value === 0) return currentIncome.value > 0 ? 100 : 0
    return ((currentIncome.value - comparisonIncome.value) / comparisonIncome.value) * 100
  })

  const expenseChange = useComputed(() => {
    if (comparisonExpenses.value === 0) return currentExpenses.value > 0 ? 100 : 0
    return ((currentExpenses.value - comparisonExpenses.value) / comparisonExpenses.value) * 100
  })

  const netFlowChange = useComputed(() => {
    if (comparisonNetFlow.value === 0) {
      if (currentNetFlow.value > 0) return 100
      if (currentNetFlow.value < 0) return -100
      return 0
    }
    return ((currentNetFlow.value - comparisonNetFlow.value) / Math.abs(comparisonNetFlow.value)) *
      100
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => group.getSelectedCurrency())

  const formatPercentageChange = (change: number) => {
    const isPositive = change >= 0
    const sign = isPositive ? "+" : ""
    return {
      value: `${sign}${change.toFixed(1)}%`,
      className: isPositive ? "text-green-600" : "text-red-600",
    }
  }

  return (
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Cash Flow Summary</h3>
        <p class="text-sm text-gray-600">{dashboard.current.label} vs Previous period</p>
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
                      amount={currentIncome.value}
                      currency={defaultCurrency.value.id}
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
                          (currentIncome.value /
                            Math.max(currentIncome.value, currentExpenses.value, 1)) *
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
                      amount={-currentExpenses.value}
                      currency={defaultCurrency.value.id}
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
                          (currentExpenses.value /
                            Math.max(currentIncome.value, currentExpenses.value, 1)) *
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
                    currency={defaultCurrency.value.id}
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
                            Math.max(currentIncome.value, currentExpenses.value, 1) * 50,
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
