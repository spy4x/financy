import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { category } from "../../../state/category.ts"
import { transaction } from "../../../state/transaction.ts"
import { group } from "../../../state/group.ts"
import { BudgetProgress } from "../../../components/ui/BudgetProgress.tsx"
import { TransactionDirection, TransactionUtils } from "@shared/types"

export function BudgetProgressBars() {
  // Get current month transactions for spending calculations
  const currentMonthTransactions = useComputed(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    return transaction.list.value
      .filter((txn) => {
        const txnDate = new Date(txn.timestamp)
        return (
          txn.groupId === group.selectedId.value &&
          txn.direction === TransactionDirection.MONEY_OUT && // Only money out transactions count towards spending
          TransactionUtils.affectsProfitLoss(txn.type) && // Exclude transfers
          txnDate >= startOfMonth &&
          txnDate <= endOfMonth &&
          !txn.deletedAt
        )
      })
  })

  // Get categories with budgets for selected group (only expense categories should have budgets)
  const categoriesWithBudgets = useComputed(() =>
    category.list.value
      .filter((cat) =>
        cat.groupId === group.selectedId.value &&
        (cat.type === undefined || cat.type === 1) && // Only expense categories (backward compatibility with undefined)
        cat.monthlyLimit &&
        cat.monthlyLimit > 0 &&
        !cat.deletedAt
      )
  )

  // Calculate spending per category
  const categorySpending = useComputed(() => {
    const spending: Record<number, number> = {}

    currentMonthTransactions.value.forEach((txn) => {
      if (txn.categoryId && !spending[txn.categoryId]) {
        spending[txn.categoryId] = 0
      }
      if (txn.categoryId) {
        spending[txn.categoryId] += Math.abs(txn.amount)
      }
    })

    return spending
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => group.getSelectedCurrency())
  if (categoriesWithBudgets.value.length === 0) {
    return (
      <div>
        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Budget Progress</h2>
        <div class="card">
          <div class="card-body text-center py-8">
            <p class="text-gray-500 mb-4">No budget limits set</p>
            <p class="text-sm text-gray-400 mb-4">
              Set monthly spending limits for your categories to track budget progress.
            </p>
            {group.selectedId.value
              ? (
                <Link
                  href="/categories"
                  class="btn btn-sm btn-primary"
                >
                  Manage Categories
                </Link>
              )
              : (
                <div class="btn btn-sm btn-disabled cursor-not-allowed">
                  Manage Categories
                </div>
              )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Budget Progress</h2>
      <div class="card">
        <div class="card-body">
          <div class="space-y-6">
            {categoriesWithBudgets.value.map((cat) => {
              const spentAmount = categorySpending.value[cat.id] || 0
              const limitAmount = cat.monthlyLimit || 0

              return (
                <div key={cat.id} class="space-y-2">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      {cat.icon && <span class="text-lg">{cat.icon}</span>}
                      {cat.color && (
                        <div
                          class="w-3 h-3 rounded-full border border-gray-300"
                          style={{ backgroundColor: cat.color }}
                          title={`Category: ${cat.name}`}
                        />
                      )}
                      <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {cat.name}
                      </h3>
                    </div>
                  </div>
                  <BudgetProgress
                    spentAmount={spentAmount}
                    limitAmount={limitAmount}
                    currency={defaultCurrency.value.code}
                    color={cat.color}
                  />
                </div>
              )
            })}
          </div>

          <div class="mt-6 pt-4 border-t border-gray-200">
            <Link
              href="/categories"
              class="btn btn-sm btn-primary-outline w-full"
            >
              Manage Categories & Budgets
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
