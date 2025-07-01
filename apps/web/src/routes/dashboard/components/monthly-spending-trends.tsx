import { useComputed } from "@preact/signals"
import { transaction } from "@web/state/transaction.ts"
import { group } from "@web/state/group.ts"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { TransactionDirection, TransactionUtils } from "@shared/types"

export function MonthlySpendingTrends() {
  // Generate last 6 months of data
  const monthlyData = useComputed(() => {
    const data = []
    const now = new Date()

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)

      const monthTransactions = transaction.list.value
        .filter((txn) =>
          txn.groupId === group.selectedId.value &&
          new Date(txn.timestamp) >= monthDate &&
          new Date(txn.timestamp) < nextMonthDate &&
          !txn.deletedAt
        )

      const income = monthTransactions
        .filter((txn) =>
          txn.direction === TransactionDirection.MONEY_IN &&
          TransactionUtils.affectsProfitLoss(txn.type)
        )
        .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)

      const expenses = monthTransactions
        .filter((txn) =>
          txn.direction === TransactionDirection.MONEY_OUT &&
          TransactionUtils.affectsProfitLoss(txn.type)
        )
        .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)

      data.push({
        month: monthDate.toLocaleDateString("en-US", { month: "short" }),
        fullMonth: monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        income,
        expenses,
        netFlow: income - expenses,
        isCurrentMonth: i === 0,
      })
    }

    return data
  })

  // Calculate max values for scaling the bars
  const maxIncome = useComputed(() => Math.max(...monthlyData.value.map((m) => m.income), 1))

  const maxExpenses = useComputed(() => Math.max(...monthlyData.value.map((m) => m.expenses), 1))

  const defaultCurrencyId = useComputed<number>(() => group.getSelectedCurrency().id)

  // Calculate trends
  const trends = useComputed(() => {
    const data = monthlyData.value
    if (data.length < 2) return { income: 0, expenses: 0 }

    const currentMonth = data[data.length - 1]
    const previousMonth = data[data.length - 2]

    const incomeChange = previousMonth.income === 0
      ? (currentMonth.income > 0 ? 100 : 0)
      : ((currentMonth.income - previousMonth.income) / previousMonth.income) * 100

    const expenseChange = previousMonth.expenses === 0
      ? (currentMonth.expenses > 0 ? 100 : 0)
      : ((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100

    return { income: incomeChange, expenses: expenseChange }
  })

  const formatTrend = (change: number) => {
    const isPositive = change >= 0
    const sign = isPositive ? "+" : ""
    return {
      value: `${sign}${change.toFixed(1)}%`,
      className: `text-xs ${isPositive ? "text-green-600" : "text-red-600"}`,
      icon: isPositive ? "↗" : "↘",
    }
  }

  const averageIncome = useComputed(() =>
    monthlyData.value.reduce((sum, m) => sum + m.income, 0) / Math.max(monthlyData.value.length, 1)
  )

  const averageExpenses = useComputed(() =>
    monthlyData.value.reduce((sum, m) => sum + m.expenses, 0) /
    Math.max(monthlyData.value.length, 1)
  )

  return (
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
          Monthly Spending Trends
        </h3>
        <p class="text-sm text-gray-600">Last 6 months overview</p>
      </div>
      <div class="card-body">
        {/* Summary Stats */}
        <div class="grid grid-cols-2 gap-4 mb-6">
          <div class="text-center">
            <div class="text-sm text-gray-600 mb-1">Average Income</div>
            <div class="text-lg font-semibold text-green-600">
              <CurrencyDisplay
                amount={averageIncome.value}
                currency={defaultCurrencyId.value}
              />
            </div>
            <div class={formatTrend(trends.value.income).className}>
              {formatTrend(trends.value.income).icon} {formatTrend(trends.value.income).value}
            </div>
          </div>
          <div class="text-center">
            <div class="text-sm text-gray-600 mb-1">Average Expenses</div>
            <div class="text-lg font-semibold text-red-600">
              <CurrencyDisplay
                amount={averageExpenses.value}
                currency={defaultCurrencyId.value}
              />
            </div>
            <div class={formatTrend(trends.value.expenses).className}>
              {formatTrend(trends.value.expenses).icon} {formatTrend(trends.value.expenses).value}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div class="space-y-4">
          {monthlyData.value.map((month) => (
            <div key={month.month} class="space-y-2">
              <div class="flex items-center justify-between">
                <span
                  class={`text-sm font-medium ${
                    month.isCurrentMonth ? "text-blue-600" : "text-gray-700"
                  }`}
                >
                  {month.month}
                  {month.isCurrentMonth && (
                    <span class="text-xs text-blue-500 ml-1">
                      (Current)
                    </span>
                  )}
                </span>
                <div class="text-right">
                  <div class="text-xs text-gray-500">
                    Net: {month.netFlow >= 0 ? "+" : ""}
                    <CurrencyDisplay
                      amount={month.netFlow}
                      currency={defaultCurrencyId.value}
                    />
                  </div>
                </div>
              </div>

              {/* Income Bar */}
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-green-600">Income</span>
                  <CurrencyDisplay
                    amount={month.income}
                    currency={defaultCurrencyId.value}
                  />
                </div>
                <div class="bg-gray-200 rounded-full h-2">
                  <div
                    class={`bg-green-500 h-2 rounded-full transition-all duration-300 ${
                      month.isCurrentMonth ? "bg-green-600" : "bg-green-500"
                    }`}
                    style={{
                      width: `${(month.income / maxIncome.value) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Expenses Bar */}
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-red-600">Expenses</span>
                  <CurrencyDisplay
                    amount={month.expenses}
                    currency={defaultCurrencyId.value}
                  />
                </div>
                <div class="bg-gray-200 rounded-full h-2">
                  <div
                    class={`bg-red-500 h-2 rounded-full transition-all duration-300 ${
                      month.isCurrentMonth ? "bg-red-600" : "bg-red-500"
                    }`}
                    style={{
                      width: `${(month.expenses / maxExpenses.value) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div class="mt-6 flex items-center justify-center space-x-6 text-xs text-gray-500">
          <div class="flex items-center space-x-2">
            <div class="w-3 h-2 bg-green-500 rounded" />
            <span>Income</span>
          </div>
          <div class="flex items-center space-x-2">
            <div class="w-3 h-2 bg-red-500 rounded" />
            <span>Expenses</span>
          </div>
        </div>
      </div>
    </div>
  )
}
