import { useComputed } from "@preact/signals"
import { account } from "../../../state/account.ts"
import { transaction } from "@web/state/transaction.ts"
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

export function FinancialOverviewCards() {
  // Calculate total balance as of the end of the selected date range
  const totalBalanceAtRangeEnd = useComputed(() => {
    const range = dashboard.current
    const rangeEndTime = range.endDate.getTime()

    return account.list.value
      .filter((acc) => acc.groupId === group.selectedId.value && !acc.deletedAt)
      .reduce((sum, acc) => {
        // Get all transactions for this account up to the end of the selected range
        const accountTransactions = transaction.list.value
          .filter((txn) => {
            const txnTime = new Date(txn.timestamp).getTime()
            return (
              txn.accountId === acc.id &&
              txnTime <= rangeEndTime &&
              !txn.deletedAt
            )
          })

        // Calculate balance: starting balance + all transactions up to range end
        const transactionSum = accountTransactions.reduce((txnSum, txn) => {
          return txnSum + (txn.direction === 1 ? -Math.abs(txn.amount) : Math.abs(txn.amount))
        }, 0)

        return sum + acc.startingBalance + transactionSum
      }, 0)
  })

  // Get transactions for the selected date range
  const rangeTransactions = useComputed(() => {
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

  // Calculate income for the selected date range (MONEY_IN transactions, excluding transfers)
  const rangeIncome = useComputed(() =>
    rangeTransactions.value
      .filter((txn) =>
        txn.direction === TransactionDirection.MONEY_IN &&
        TransactionUtils.affectsProfitLoss(txn.type)
      )
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  // Calculate expenses for the selected date range (MONEY_OUT transactions, excluding transfers)
  const rangeExpenses = useComputed(() =>
    rangeTransactions.value
      .filter((txn) =>
        txn.direction === TransactionDirection.MONEY_OUT &&
        TransactionUtils.affectsProfitLoss(txn.type)
      )
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  )

  // Calculate net cash flow (income - expenses)
  const netCashFlow = useComputed(() => rangeIncome.value - rangeExpenses.value)

  // Get the default currency from selected group
  const defaultCurrencyId = useComputed<number>(() => group.getSelectedCurrency().id)

  // Get period description for card labels
  const periodDescription = useComputed(() => {
    const range = dashboard.current
    const now = new Date()

    // Check if it's current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    if (
      range.startDate.getTime() === currentMonthStart.getTime() &&
      range.endDate.getTime() === currentMonthEnd.getTime()
    ) {
      return "This month"
    }

    return range.label
  })

  // Get balance description for Total Balance card
  const balanceDescription = useComputed(() => {
    const range = dashboard.current
    const now = new Date()

    // Check if it's current date
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    if (range.endDate.getTime() >= today.getTime()) {
      return "Current balance"
    }

    return `Balance as of ${
      range.endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: range.endDate.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      })
    }`
  })

  const cards = [
    {
      title: "Total Balance",
      amount: totalBalanceAtRangeEnd.value,
      description: balanceDescription.value,
      positive: totalBalanceAtRangeEnd.value >= 0,
      link: "/accounts",
    },
    {
      title: "Income",
      amount: rangeIncome.value,
      description: periodDescription.value,
      positive: true,
      link: `/transactions?type=2&${getDateRangeQuery()}`,
    },
    {
      title: "Expenses",
      amount: -rangeExpenses.value, // Display as negative
      description: periodDescription.value,
      positive: false,
      link: `/transactions?type=1&${getDateRangeQuery()}`,
    },
    {
      title: "Net Cash Flow",
      amount: netCashFlow.value,
      description: "Income - Expenses",
      positive: netCashFlow.value >= 0,
      link: `/transactions?${getDateRangeQuery()}`,
    },
  ]

  return (
    <div>
      <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Financial Overview</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => (
          <Link
            key={index}
            href={card.link}
            class="card hover:shadow-lg transition-shadow"
            title={card.title}
          >
            <div class="card-body">
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">
                    {card.title}
                  </p>
                  <div class="mt-2">
                    <CurrencyDisplay
                      amount={card.amount}
                      currency={defaultCurrencyId.value}
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
          </Link>
        ))}
      </div>
    </div>
  )
}
