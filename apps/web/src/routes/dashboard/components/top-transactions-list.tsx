import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { navigate } from "@client/helpers"
import { transaction } from "@web/state/transaction.ts"
import { group } from "@web/state/group.ts"
import { dashboard } from "@web/state/dashboard.ts"
import { TransactionTable } from "@web/components/TransactionTable.tsx"

function getDateRangeQuery() {
  const { startDate, endDate } = dashboard.current
  return `from=${encodeURIComponent(startDate.toISOString())}&to=${
    encodeURIComponent(endDate.toISOString())
  }`
}

export function TopTransactionsList() {
  // Get the top transactions by amount within the selected date range
  const recentTransactions = useComputed(() => {
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
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 10) // Show top 10 by amount
  })

  const handleEdit = (transactionId: number) => {
    navigate(`/transactions/${transactionId}`)
  }

  const handleDelete = async (txn: { id: number }) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      await transaction.remove(txn.id)
    }
  }

  if (recentTransactions.value.length === 0) {
    return (
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">Top Transactions</h2>
          {group.selectedId.value
            ? (
              <Link
                href={`/transactions?${getDateRangeQuery()}`}
                class="btn btn-sm btn-primary"
              >
                View All
              </Link>
            )
            : (
              <div class="btn btn-sm btn-disabled cursor-not-allowed">
                View All
              </div>
            )}
        </div>
        <div class="card">
          <div class="card-body text-center py-12">
            <p class="text-gray-500 mb-4">No transactions yet</p>
            {group.selectedId.value
              ? (
                <Link
                  href="/transactions/create"
                  class="btn btn-primary"
                >
                  Add Your First Transaction
                </Link>
              )
              : (
                <div class="btn btn-disabled cursor-not-allowed">
                  Add Your First Transaction
                </div>
              )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-1">
        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">Top 10 Transactions</h2>
        <Link
          href={`/transactions?${getDateRangeQuery()}`}
          class="btn btn-sm btn-primary"
        >
          View All
        </Link>
      </div>
      <div class="mb-3">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          These are your most expensive transactions in the selected period.
        </p>
      </div>

      <TransactionTable
        transactions={recentTransactions}
        onEdit={handleEdit}
        onDelete={handleDelete}
        showActions
      />
    </div>
  )
}
