import { type JSX } from "preact"
import { formatMoney } from "@shared/helpers/format.ts"

interface BudgetProgressProps {
  spentAmount: number
  limitAmount: number
  currency: string
}

export function BudgetProgress(
  { spentAmount, limitAmount, currency }: BudgetProgressProps,
): JSX.Element {
  // Use absolute value since spentAmount can be negative (debit transactions)
  const absoluteSpentAmount = Math.abs(spentAmount)

  if (limitAmount === 0) {
    return (
      <div class="space-y-1">
        <div class="flex justify-between text-sm">
          <span class="text-gray-700">
            {formatMoney(absoluteSpentAmount, currency)} spent
          </span>
          <span class="text-gray-500">No budget set</span>
        </div>
      </div>
    )
  }

  const percentage = Math.min((absoluteSpentAmount / limitAmount) * 100, 100)
  const isOverBudget = absoluteSpentAmount > limitAmount
  const remainingAmount = Math.max(limitAmount - absoluteSpentAmount, 0)

  return (
    <div class="space-y-1">
      <div class="flex justify-between text-sm">
        <span class={isOverBudget ? "text-red-600 font-medium" : "text-gray-700"}>
          {formatMoney(absoluteSpentAmount, currency)} spent
        </span>
        <span class="text-gray-500">
          of {formatMoney(limitAmount, currency)}
        </span>
      </div>

      <div class="w-full bg-gray-200 rounded-full h-2">
        <div
          class={`h-2 rounded-full transition-all duration-300 ${
            isOverBudget ? "bg-red-500" : percentage > 80 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {isOverBudget
        ? (
          <div class="text-xs text-red-600 font-medium">
            Over budget by {formatMoney(absoluteSpentAmount - limitAmount, currency)}
          </div>
        )
        : (
          <div class="text-xs text-gray-500">
            {formatMoney(remainingAmount, currency)} remaining
          </div>
        )}
    </div>
  )
}
