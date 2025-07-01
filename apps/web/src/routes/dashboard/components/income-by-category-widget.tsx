import { useComputed } from "@preact/signals"
import { transaction } from "@web/state/transaction.ts"
import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"
import { dashboard } from "@web/state/dashboard.ts"

function getDateRangeQuery() {
  const { startDate, endDate } = dashboard.current
  return `from=${encodeURIComponent(startDate.toISOString())}&to=${
    encodeURIComponent(endDate.toISOString())
  }`
}
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { TransactionDirection, TransactionUtils } from "@shared/types"
import { Link } from "wouter-preact"

export function IncomeByCategoryWidget() {
  // Get transactions for the selected date range for income calculations
  const rangeTransactions = useComputed(() => {
    const range = dashboard.current
    return transaction.list.value
      .filter((txn) => {
        const txnDate = new Date(txn.timestamp)
        return (
          txn.groupId === group.selectedId.value &&
          txn.direction === TransactionDirection.MONEY_IN && // Only money in transactions for income
          TransactionUtils.affectsProfitLoss(txn.type) && // Exclude transfers
          txnDate >= range.startDate &&
          txnDate <= range.endDate &&
          !txn.deletedAt
        )
      })
  })

  // Get categories for selected group
  const groupCategories = useComputed(() =>
    category.list.value
      .filter((cat) =>
        cat.groupId === group.selectedId.value &&
        !cat.deletedAt &&
        (cat.type === 2) // Only income categories
      )
  )

  // Calculate income per category with percentages
  const categoryIncomeData = useComputed(() => {
    const income: Record<
      number,
      { amount: number; categoryName: string; icon?: string; color?: string }
    > = {}
    let totalIncome = 0

    // Calculate income per category
    rangeTransactions.value.forEach((txn) => {
      if (txn.categoryId && !income[txn.categoryId]) {
        const cat = groupCategories.value.find((c) => c.id === txn.categoryId)
        income[txn.categoryId] = {
          amount: 0,
          categoryName: cat?.name || "Unknown Category",
          icon: cat?.icon || undefined,
          color: cat?.color || undefined,
        }
      }
      // Use absolute amount for income calculations
      const incomeAmount = Math.abs(txn.amount)
      if (txn.categoryId) {
        income[txn.categoryId].amount += incomeAmount
      }
      totalIncome += incomeAmount
    })

    // Convert to array and add percentages
    const incomeArray = Object.entries(income)
      .map(([categoryId, data]) => ({
        categoryId: parseInt(categoryId),
        ...data,
        percentage: totalIncome > 0 ? (data.amount / totalIncome) * 100 : 0,
        totalIncome, // Include total for efficiency
      }))
      .sort((a, b) => b.amount - a.amount) // Sort by income amount descending

    return incomeArray
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => group.getSelectedCurrency())

  // Get total income from category data
  const totalIncome = useComputed(() => {
    const data = categoryIncomeData.value
    return data.length > 0 ? data[0].totalIncome || 0 : 0
  })

  if (categoryIncomeData.value.length === 0) {
    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Income by Category</h3>
        </div>
        <div class="card-body">
          <div class="text-center py-8">
            <div class="text-gray-500 mb-2">No income data for this month</div>
            <div class="text-sm text-gray-400">
              Add income transactions to see your income breakdown
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Income by Category</h3>
        <div class="text-sm text-gray-600">
          Total: <CurrencyDisplay amount={totalIncome.value} currency={defaultCurrency.value.id} />
        </div>
      </div>
      <div class="card-body">
        <div class="space-y-4">
          {categoryIncomeData.value.map((item) => (
            <Link
              key={item.categoryId}
              href={`/transactions?categoryId=${item.categoryId}&${getDateRangeQuery()}`}
              class="block cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors space-y-2"
              title={`View transactions for ${item.categoryName}`}
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                  {item.icon && (
                    <span class="text-lg" title={item.categoryName}>
                      {item.icon}
                    </span>
                  )}
                  <span class="font-medium text-gray-900">{item.categoryName}</span>
                  <span class="text-base font-semibold text-green-700">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
                <div class="text-right">
                  <CurrencyDisplay
                    amount={item.amount}
                    currency={defaultCurrency.value.id}
                    class="font-medium text-gray-900"
                  />
                </div>
              </div>
              {/* Visual progress bar */}
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  class="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.color || "#22C55E", // Default to green if no color
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
