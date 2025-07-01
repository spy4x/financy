import { useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { navigate } from "@client/helpers"
import { transaction } from "../../../state/transaction.ts"
import { account } from "../../../state/account.ts"
import { category } from "../../../state/category.ts"
import { group } from "../../../state/group.ts"
import { currency } from "../../../state/currency.ts"
import { Table } from "../../../components/ui/Table.tsx"
import { CurrencyDisplay } from "../../../components/ui/CurrencyDisplay.tsx"
import { Dropdown } from "../../../components/ui/Dropdown.tsx"
import { IconEllipsisVertical, IconPencilSquare, IconTrashBin } from "@client/icons"
import { TransactionDirection } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"

export function TopTransactionsList() {
  // Get the 10 most expensive transactions for selected group (by absolute amount)
  const recentTransactions = useComputed(() =>
    transaction.list.value
      .filter((txn) =>
        txn.groupId === group.selectedId.value &&
        !txn.deletedAt
      )
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 10) // Show top 10 by amount
  )

  // Helper functions to get names
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
                href="/transactions"
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
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">Top Transactions</h2>
        <Link
          href="/transactions"
          class="btn btn-sm btn-primary"
        >
          View All
        </Link>
      </div>

      <Table
        headerSlot={
          <>
            <th scope="col" class="text-left">Timestamp</th>
            <th scope="col" class="text-right">Amount</th>
            <th scope="col" class="text-left">Description</th>
            <th scope="col" class="text-left">Category</th>
            <th scope="col" class="text-left">Account</th>
            <th scope="col" class="text-right">Actions</th>
          </>
        }
        bodySlots={recentTransactions.value.map((txn, index) => {
          // Determine color for amount: transfers = blue, out = red, in = green
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
                {formatTimestamp(txn.timestamp)}
              </td>
              <td class={`text-right ${amountClass}`}>
                <CurrencyDisplay
                  amount={txn.amount}
                  currency={getAccountCurrency(txn.accountId)}
                  class={amountClass}
                  highlightNegative={txn.direction === TransactionDirection.MONEY_OUT}
                />
              </td>
              <td class="text-gray-900">
                <div class="max-w-xs truncate" title={txn.memo || "No description"}>
                  {txn.memo || <span class="text-gray-400 italic">No description</span>}
                </div>
              </td>
              <td class="text-gray-500">
                {(() => {
                  const categoryDisplay = txn.categoryId
                    ? getCategoryDisplay(txn.categoryId)
                    : { name: "N/A", icon: "", color: "#gray" }
                  return txn.categoryId
                    ? (
                      <Link
                        href={`/transactions?categoryId=${txn.categoryId}`}
                        class="flex items-center gap-2 hover:underline text-blue-700"
                        title={`View all transactions for ${categoryDisplay.name}`}
                      >
                        {categoryDisplay.icon && (
                          <span class="text-sm">{categoryDisplay.icon}</span>
                        )}
                        {categoryDisplay.color && (
                          <div
                            class="w-3 h-3 rounded-full border border-gray-300"
                            style={{ backgroundColor: categoryDisplay.color }}
                            title={`Category: ${categoryDisplay.name}`}
                          />
                        )}
                        <span class="truncate">{categoryDisplay.name}</span>
                      </Link>
                    )
                    : <span class="truncate">{categoryDisplay.name}</span>
                })()}
              </td>
              <td class="text-gray-500">
                <Link
                  href={`/transactions?accountId=${txn.accountId}`}
                  class="hover:underline text-blue-700"
                  title={`View all transactions for ${getAccountName(txn.accountId)}`}
                >
                  {getAccountName(txn.accountId)}
                </Link>
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
