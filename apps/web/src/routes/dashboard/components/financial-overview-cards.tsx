import { useComputed } from "@preact/signals"
import { account } from "../../../state/account.ts"
import { transaction } from "../../../state/transaction.ts"
import { group } from "../../../state/group.ts"
import { CurrencyDisplay } from "../../../components/ui/CurrencyDisplay.tsx"
import { TransactionType } from "@shared/types"

export function FinancialOverviewCards() {
  // Calculate total balance across all accounts in selected group
  const totalBalance = useComputed(() =>
    account.list.value
      .filter((acc) => acc.groupId === group.selectedId.value && !acc.deletedAt)
      .reduce((sum, acc) => sum + acc.balance, 0)
  )

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

  // Calculate monthly income (CREDIT transactions - money coming in)
  const monthlyIncome = useComputed(() =>
    currentMonthTransactions.value
      .filter((txn) => txn.type === TransactionType.CREDIT)
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  // Calculate monthly expenses (DEBIT transactions - money going out)
  const monthlyExpenses = useComputed(() =>
    currentMonthTransactions.value
      .filter((txn) => txn.type === TransactionType.DEBIT)
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  // Calculate net cash flow (income - expenses)
  const netCashFlow = useComputed(() => monthlyIncome.value - monthlyExpenses.value)

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => {
    const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
    return selectedGroup?.defaultCurrency || "USD"
  })

  const cards = [
    {
      title: "Total Balance",
      amount: totalBalance.value,
      description: "Across all accounts",
      positive: totalBalance.value >= 0,
    },
    {
      title: "Monthly Income",
      amount: monthlyIncome.value,
      description: "This month",
      positive: true,
    },
    {
      title: "Monthly Expenses",
      amount: -monthlyExpenses.value, // Display as negative
      description: "This month",
      positive: false,
    },
    {
      title: "Net Cash Flow",
      amount: netCashFlow.value,
      description: "Income - Expenses",
      positive: netCashFlow.value >= 0,
    },
  ]

  return (
    <div>
      <h2 class="text-lg font-medium text-gray-900 mb-4">Financial Overview</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => (
          <div key={index} class="card">
            <div class="card-body">
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">
                    {card.title}
                  </p>
                  <div class="mt-2">
                    <CurrencyDisplay
                      amount={card.amount}
                      currency={defaultCurrency.value}
                      class={`text-2xl font-bold ${
                        card.positive ? "text-green-600" : "text-red-600"
                      }`}
                    />
                  </div>
                  <p class="text-sm text-gray-500 mt-1">
                    {card.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
