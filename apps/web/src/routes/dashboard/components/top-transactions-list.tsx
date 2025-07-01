import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { navigate } from "@client/helpers"
import { transaction } from "@web/state/transaction.ts"
import { account } from "../../../state/account.ts"
import { category } from "../../../state/category.ts"
import { group } from "@web/state/group.ts"
import { currency } from "../../../state/currency.ts"
import { dashboard } from "@web/state/dashboard.ts"

function getDateRangeQuery() {
  const { startDate, endDate } = dashboard.current
  return `from=${encodeURIComponent(startDate.toISOString())}&to=${
    encodeURIComponent(endDate.toISOString())
  }`
}
import { Table } from "@web/components/ui/Table.tsx"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { IconEllipsisVertical, IconPencilSquare, IconTrashBin } from "@client/icons"
import { TransactionDirection } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"

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

  // Helper functions to get names and display info
  const getAccountName = (accountId: number) => {
    const acc = account.list.value.find((a) => a.id === accountId)
    return acc?.name || "Unknown Account"
  }

  const getCategoryDisplay = (categoryId: number) => {
    const cat = category.list.value.find((c) => c.id === categoryId)
    return {
      name: cat?.name || "Unknown Category",
      icon: cat?.icon || undefined,
      color: cat?.color || undefined,
    }
  }

  // For transfer, find the linked transaction (other side of transfer)
  const getLinkedTransaction = (txn: typeof transaction.list.value[number]) => {
    return txn.linkedTransactionCode
      ? transaction.list.value.find((t) =>
        t.linkedTransactionCode === txn.linkedTransactionCode && t.id !== txn.id
      )
      : null
  }

  const getAccountCurrency = (accountId: number) => {
    const acc = account.list.value.find((a) => a.id === accountId)
    return currency.getById(acc?.currencyId || 1).code
  }

  const formatTimestamp = (dateString: string | Date) => {
    const date = new Date(dateString)
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleEdit = (transactionId: number) => {
    navigate(`/transactions/${transactionId}`)
  }

  const handleDelete = async (transactionId: number) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      await transaction.remove(transactionId)
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

      <Table
        headerSlot={
          <>
            <th scope="col" class="text-left">Timestamp</th>
            <th scope="col" class="text-right">Amount</th>
            <th scope="col" class="text-left">Account / Category</th>
            <th scope="col" class="text-left">Description</th>
            <th scope="col" class="text-right">Actions</th>
          </>
        }
        bodySlots={recentTransactions.value.map((txn, index) => {
          let amountClass = ""
          if (txn.type === 3) {
            amountClass = "text-blue-600"
          } else if (txn.direction === TransactionDirection.MONEY_OUT) {
            amountClass = "text-red-600"
          } else {
            amountClass = "text-green-600"
          }
          return (
            <>
              <td class="text-gray-900">
                <Link
                  href={`/transactions/${txn.id}`}
                  class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  data-e2e="transaction-timestamp-link"
                >
                  {formatTimestamp(txn.timestamp)}
                </Link>
              </td>
              <td class={`text-right ${amountClass}`}>
                <Link
                  href={`/transactions/${txn.id}`}
                  class={`${amountClass} hover:underline cursor-pointer hover:opacity-80`}
                  data-e2e="transaction-amount-link"
                >
                  <CurrencyDisplay
                    amount={txn.amount}
                    currency={getAccountCurrency(txn.accountId)}
                    class={amountClass}
                    highlightNegative={txn.direction === TransactionDirection.MONEY_OUT}
                  />
                </Link>
              </td>
              <td class="text-gray-900">
                <div class="text-sm">
                  {txn.type === 3
                    ? (
                      // Transfer: Show direction based on amount sign
                      (() => {
                        const linkedTransaction = getLinkedTransaction(txn)
                        if (txn.amount < 0) {
                          // Money out: This Account → Other Account
                          return (
                            <>
                              <Link
                                href={`/accounts/${txn.accountId}`}
                                class="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {getAccountName(txn.accountId)}
                              </Link>
                              <span class="mx-2 text-gray-500">→</span>
                              {linkedTransaction
                                ? (
                                  <Link
                                    href={`/accounts/${linkedTransaction.accountId}`}
                                    class="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {getAccountName(linkedTransaction.accountId)}
                                  </Link>
                                )
                                : <span class="text-gray-400">Unknown Account</span>}
                            </>
                          )
                        } else {
                          // Money in: Other Account → This Account
                          return (
                            <>
                              {linkedTransaction
                                ? (
                                  <Link
                                    href={`/accounts/${linkedTransaction.accountId}`}
                                    class="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {getAccountName(linkedTransaction.accountId)}
                                  </Link>
                                )
                                : <span class="text-gray-400">Unknown Account</span>}
                              <span class="mx-2 text-gray-500">→</span>
                              <Link
                                href={`/accounts/${txn.accountId}`}
                                class="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {getAccountName(txn.accountId)}
                              </Link>
                            </>
                          )
                        }
                      })()
                    )
                    : txn.type === 2
                    ? (
                      // INCOME: Show "Category → Account"
                      <>
                        {txn.categoryId
                          ? (
                            <Link
                              href={`/categories/${txn.categoryId}`}
                              class="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {(() => {
                                const categoryDisplay = getCategoryDisplay(txn.categoryId)
                                return (
                                  <span class="inline-flex items-center gap-1">
                                    {categoryDisplay.icon && (
                                      <span class="text-sm">{categoryDisplay.icon}</span>
                                    )}
                                    {categoryDisplay.color && (
                                      <div
                                        class="w-2 h-2 rounded-full border border-gray-300"
                                        style={{ backgroundColor: categoryDisplay.color }}
                                      />
                                    )}
                                    <span>{categoryDisplay.name}</span>
                                  </span>
                                )
                              })()}
                            </Link>
                          )
                          : <span class="text-gray-500">No Category</span>}
                        <span class="mx-2 text-gray-500">→</span>
                        <Link
                          href={`/accounts/${txn.accountId}`}
                          class="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {getAccountName(txn.accountId)}
                        </Link>
                      </>
                    )
                    : (
                      // EXPENSE: Show "Account → Category"
                      <>
                        <Link
                          href={`/accounts/${txn.accountId}`}
                          class="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {getAccountName(txn.accountId)}
                        </Link>
                        <span class="mx-2 text-gray-500">→</span>
                        {txn.categoryId
                          ? (
                            <Link
                              href={`/categories/${txn.categoryId}`}
                              class="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {(() => {
                                const categoryDisplay = getCategoryDisplay(txn.categoryId)
                                return (
                                  <span class="inline-flex items-center gap-1">
                                    {categoryDisplay.icon && (
                                      <span class="text-sm">{categoryDisplay.icon}</span>
                                    )}
                                    {categoryDisplay.color && (
                                      <div
                                        class="w-2 h-2 rounded-full border border-gray-300"
                                        style={{ backgroundColor: categoryDisplay.color }}
                                      />
                                    )}
                                    <span>{categoryDisplay.name}</span>
                                  </span>
                                )
                              })()}
                            </Link>
                          )
                          : <span class="text-gray-500">No Category</span>}
                      </>
                    )}
                </div>
              </td>
              <td class="text-gray-900">
                <div class="max-w-xs truncate" title={txn.memo || "No description"}>
                  {txn.memo || <span class="text-gray-400 italic">No description</span>}
                </div>
              </td>
              <td class="text-right">
                <Dropdown
                  trigger={<IconEllipsisVertical class="size-5" />}
                  triggerClasses="btn-input-icon"
                  vertical={shouldDropdownOpenUp(index, recentTransactions.value.length)
                    ? "up"
                    : "down"}
                >
                  <div class="py-1" role="none">
                    <button
                      onClick={() => handleEdit(txn.id)}
                      type="button"
                      class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <IconPencilSquare class="size-4 mr-2" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(txn.id)}
                      type="button"
                      class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <IconTrashBin class="size-4 mr-2" />
                      Delete
                    </button>
                  </div>
                </Dropdown>
              </td>
            </>
          )
        })}
      />
    </div>
  )
}
