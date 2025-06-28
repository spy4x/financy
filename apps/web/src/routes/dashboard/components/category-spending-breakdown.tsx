import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { transaction } from "../../../state/transaction.ts"
import { category } from "../../../state/category.ts"
import { group } from "../../../state/group.ts"
import { CurrencyDisplay } from "../../../components/ui/CurrencyDisplay.tsx"
import { TransactionType } from "@shared/types"

export function CategorySpendingBreakdown() {
  // Get current month transactions for spending calculations
  const currentMonthTransactions = useComputed(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    return transaction.list.value
      .filter((txn) => {
        const txnDate = new Date(txn.createdAt)
        return (
          txn.groupId === group.selectedId.value &&
          txn.type === TransactionType.DEBIT && // Only debit transactions for spending
          txnDate >= startOfMonth &&
          txnDate <= endOfMonth &&
          !txn.deletedAt
        )
      })
  })

  // Get categories for selected group
  const groupCategories = useComputed(() =>
    category.list.value
      .filter((cat) =>
        cat.groupId === group.selectedId.value &&
        !cat.deletedAt
      )
  )

  // Calculate spending per category with percentages
  const categorySpendingData = useComputed(() => {
    const spending: Record<
      number,
      { amount: number; categoryName: string; monthlyLimit?: number; icon?: string; color?: string }
    > = {}
    let totalSpending = 0

    // Calculate spending per category
    currentMonthTransactions.value.forEach((txn) => {
      if (!spending[txn.categoryId]) {
        const cat = groupCategories.value.find((c) => c.id === txn.categoryId)
        spending[txn.categoryId] = {
          amount: 0,
          categoryName: cat?.name || "Unknown Category",
          monthlyLimit: cat?.monthlyLimit || undefined,
          icon: cat?.icon || undefined,
          color: cat?.color || undefined,
        }
      }
      // Use absolute amount for spending calculations since amounts are stored as positive values
      // and we've already filtered for DEBIT transactions only
      const spendingAmount = Math.abs(txn.amount)
      spending[txn.categoryId].amount += spendingAmount
      totalSpending += spendingAmount
    })

    // Convert to array and add percentages
    const spendingArray = Object.entries(spending)
      .map(([categoryId, data]) => ({
        categoryId: parseInt(categoryId),
        ...data,
        percentage: totalSpending > 0 ? (data.amount / totalSpending) * 100 : 0,
        totalSpending, // Include total for efficiency
      }))
      .sort((a, b) => b.amount - a.amount) // Sort by spending amount descending

    return spendingArray
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => group.getSelectedCurrency())

  // Get total spending from category data (more efficient than recalculating)
  const totalSpending = useComputed(() => {
    const data = categorySpendingData.value
    return data.length > 0 ? data[0].totalSpending || 0 : 0
  })

  if (categorySpendingData.value.length === 0) {
    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Category Spending Breakdown</h3>
        </div>
        <div class="card-body">
          <div class="text-center py-8">
            <div class="text-gray-500 mb-2">No spending data for this month</div>
            <div class="text-sm text-gray-400">
              Start adding transactions to see your spending breakdown
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Category Spending Breakdown</h3>
        <div class="text-sm text-gray-600">
          Total:{" "}
          <CurrencyDisplay amount={totalSpending.value} currency={defaultCurrency.value.id} />
        </div>
      </div>
      <div class="card-body">
        <div class="space-y-4">
          {categorySpendingData.value.map((item) => (
            <Link
              key={item.categoryId}
              href={`/transactions?categoryId=${item.categoryId}`}
              class="block cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                  {item.icon && (
                    <span class="text-lg" title={item.categoryName}>
                      {item.icon}
                    </span>
                  )}
                  <span class="font-medium text-gray-900">{item.categoryName}</span>
                  <span class="text-xs text-gray-500">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
                <div class="text-right">
                  <CurrencyDisplay
                    amount={item.amount}
                    currency={defaultCurrency.value.id}
                    class="font-medium text-gray-900"
                  />
                  {item.monthlyLimit && (
                    <div class="text-xs text-gray-500">
                      of{" "}
                      <CurrencyDisplay
                        amount={item.monthlyLimit}
                        currency={defaultCurrency.value.id}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Visual progress bar */}
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  class="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.color || "#3B82F6", // Default to blue if no color
                  }}
                />
              </div>

              {/* Budget progress if limit exists */}
              {item.monthlyLimit && (
                <div class="mt-1">
                  <div class="w-full bg-gray-100 rounded-full h-1">
                    <div
                      class={`h-1 rounded-full transition-all duration-300 ${
                        item.amount > item.monthlyLimit
                          ? "bg-red-500"
                          : item.amount > item.monthlyLimit * 0.8
                          ? "bg-yellow-500"
                          : item.color
                          ? ""
                          : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min((item.amount / item.monthlyLimit) * 100, 100)}%`,
                        ...(item.color && item.amount <= item.monthlyLimit * 0.8 &&
                          { backgroundColor: item.color }),
                      }}
                    />
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    {((item.amount / item.monthlyLimit) * 100).toFixed(0)}% of budget
                    {item.amount > item.monthlyLimit && (
                      <span class="text-red-600 ml-1">(Over budget)</span>
                    )}
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>

        {/* View all categories link */}
        <div class="mt-6 pt-4 border-t border-gray-200">
          <Link
            href="/categories"
            class="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
          >
            View all categories →
          </Link>
        </div>
      </div>
    </div>
  )
}
