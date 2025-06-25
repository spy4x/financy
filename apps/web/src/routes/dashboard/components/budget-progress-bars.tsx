import { useComputed } from "@preact/signals"
import { useLocation } from "wouter-preact"
import { category } from "../../../state/category.ts"
import { transaction } from "../../../state/transaction.ts"
import { group } from "../../../state/group.ts"
import { BudgetProgress } from "../../../components/ui/BudgetProgress.tsx"
import { TransactionType } from "@shared/types"

export function BudgetProgressBars() {
  const [, navigate] = useLocation()
  // Get current month transactions for spending calculations
  const currentMonthTransactions = useComputed(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    return transaction.list.value
      .filter((txn) =>
        txn.groupId === group.selectedId.value &&
        txn.type === TransactionType.DEBIT && // Only debit transactions count towards spending
        new Date(txn.createdAt) >= startOfMonth &&
        !txn.deletedAt
      )
  })

  // Get categories with budgets for selected group
  const categoriesWithBudgets = useComputed(() =>
    category.list.value
      .filter((cat) =>
        cat.groupId === group.selectedId.value &&
        cat.monthlyLimit &&
        cat.monthlyLimit > 0 &&
        !cat.deletedAt
      )
  )

  // Calculate spending per category
  const categorySpending = useComputed(() => {
    const spending: Record<number, number> = {}

    currentMonthTransactions.value.forEach((txn) => {
      if (!spending[txn.categoryId]) {
        spending[txn.categoryId] = 0
      }
      spending[txn.categoryId] += txn.amount
    })

    return spending
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => {
    const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
    return selectedGroup?.defaultCurrency || "USD"
  })

  if (categoriesWithBudgets.value.length === 0) {
    return (
      <div>
        <h2 class="text-lg font-medium text-gray-900 mb-4">Budget Progress</h2>
        <div class="card">
          <div class="card-body text-center py-8">
            <p class="text-gray-500 mb-4">No budget limits set</p>
            <p class="text-sm text-gray-400 mb-4">
              Set monthly spending limits for your categories to track budget progress.
            </p>
            <button
              type="button"
              class={`btn btn-sm ${
                group.selectedId.value ? "btn-primary" : "btn-disabled cursor-not-allowed"
              }`}
              onClick={() => {
                if (group.selectedId.value) {
                  // Navigate to categories page
                  globalThis.location.href = "/categories"
                }
              }}
              disabled={!group.selectedId.value}
            >
              Manage Categories
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 class="text-lg font-medium text-gray-900 mb-4">Budget Progress</h2>
      <div class="card">
        <div class="card-body">
          <div class="space-y-6">
            {categoriesWithBudgets.value.map((cat) => {
              const spentAmount = categorySpending.value[cat.id] || 0
              const limitAmount = cat.monthlyLimit || 0

              return (
                <div key={cat.id} class="space-y-2">
                  <div class="flex items-center justify-between">
                    <h3 class="text-sm font-medium text-gray-900">
                      {cat.name}
                    </h3>
                  </div>
                  <BudgetProgress
                    spentAmount={spentAmount}
                    limitAmount={limitAmount}
                    currency={defaultCurrency.value}
                  />
                </div>
              )
            })}
          </div>

          <div class="mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              class="btn btn-sm btn-primary-outline w-full"
              onClick={() => {
                navigate("/categories")
              }}
            >
              Manage Categories & Budgets
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
