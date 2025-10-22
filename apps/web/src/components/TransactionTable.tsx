import { type Signal, useComputed } from "@preact/signals"
import { Link } from "wouter-preact"
import { Table } from "@web/components/ui/Table.tsx"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { IconArrowPath, IconEllipsisVertical, IconPencilSquare, IconTrashBin } from "@client/icons"
import { account } from "@web/state/account.ts"
import { category } from "@web/state/category.ts"
import { transaction } from "@web/state/transaction.ts"
import { currency } from "@web/state/currency.ts"
import { Transaction, TransactionType } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"
import { formatTime } from "@shared/helpers/format.ts"
import { navigate } from "@client/helpers"

interface TransactionTableProps {
  transactions: Signal<Transaction[]>
  onEdit?: (transactionId: number) => void
  onDelete?: (transaction: Transaction) => void
  onUndelete?: (transaction: Transaction) => void
  showActions?: boolean
  dataE2E?: string
}

export function TransactionTable({
  transactions,
  onEdit,
  onDelete,
  onUndelete,
  showActions = true,
  dataE2E,
}: TransactionTableProps) {
  // Helper functions
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

  const getLinkedTransaction = (txn: Transaction) => {
    return txn.linkedTransactionCode
      ? transaction.list.value.find((t) =>
        t.linkedTransactionCode === txn.linkedTransactionCode && t.id !== txn.id
      )
      : null
  }

  const getTransactionTypeDisplay = (type: TransactionType) => {
    switch (type) {
      case TransactionType.EXPENSE:
        return { label: "Expense", color: "text-red-600 dark:text-red-400" }
      case TransactionType.INCOME:
        return { label: "Income", color: "text-green-600 dark:text-green-400" }
      case TransactionType.TRANSFER:
        return { label: "Transfer", color: "text-blue-600 dark:text-blue-400" }
      default:
        return { label: "Unknown", color: "text-gray-600 dark:text-gray-400" }
    }
  }

  // Format timestamp with proper timezone handling
  const formatTimestamp = (timestamp: string | Date) => {
    const fullDateTime = formatTime(timestamp, { full: true })
    const [datePart, timePart] = fullDateTime.split(" ")
    return {
      date: datePart,
      time: timePart,
    }
  }

  // Calculate totals by currency
  const currencyTotals = useComputed(() => {
    const totals = new Map<number, { moneyIn: number; moneyOut: number; currencyId: number }>()

    transactions.value.forEach((txn) => {
      if (txn.deletedAt) return // Skip deleted transactions

      const acc = account.list.value.find((a) => a.id === txn.accountId)
      const currencyId = acc?.currencyId || 1

      if (!totals.has(currencyId)) {
        totals.set(currencyId, { moneyIn: 0, moneyOut: 0, currencyId })
      }

      const total = totals.get(currencyId)!

      if (txn.amount > 0) {
        total.moneyIn += txn.amount
      } else {
        total.moneyOut += Math.abs(txn.amount)
      }
    })

    return Array.from(totals.values()).sort((a, b) => {
      const currA = currency.getById(a.currencyId)
      const currB = currency.getById(b.currencyId)
      return currA.code.localeCompare(currB.code)
    })
  })

  const handleDefaultEdit = (transactionId: number) => {
    // Then in the handleDefaultEdit function:
    navigate(`/transactions/${transactionId}`)
  }

  const handleDefaultDelete = async (txn: Transaction) => {
    if (
      confirm(
        `Are you sure you want to delete this transaction? ${txn.memo ? `"${txn.memo}"` : ""}`,
      )
    ) {
      await transaction.remove(txn.id)
    }
  }

  const handleDefaultUndelete = async (txn: Transaction) => {
    if (
      confirm(
        `Are you sure you want to restore this transaction? ${txn.memo ? `"${txn.memo}"` : ""}`,
      )
    ) {
      await transaction.undelete(txn.id)
    }
  }

  return (
    <Table
      rowDataE2E={dataE2E}
      headerSlot={
        <>
          <th class="text-left">Date</th>
          <th class="text-right">Amount</th>
          <th class="text-left">Account / Destination</th>
          <th class="text-left">Memo</th>
          {showActions && <th class="text-right">Actions</th>}
        </>
      }
      bodySlots={transactions.value.map((txn, index) => {
        const typeDisplay = getTransactionTypeDisplay(txn.type)
        const acc = account.list.value.find((a) => a.id === txn.accountId)
        const currencyId = acc?.currencyId || 1
        const isDeleted = !!txn.deletedAt

        return (
          <>
            <td class={`whitespace-nowrap ${isDeleted ? "text-gray-400" : ""}`}>
              <Link
                href={`/transactions/${txn.id}`}
                class={`text-sm hover:underline cursor-pointer ${
                  isDeleted
                    ? "line-through text-gray-400"
                    : "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                }`}
                data-e2e="transaction-date-link"
              >
                <div>
                  {formatTimestamp(txn.timestamp).date}
                  {isDeleted && <span class="ml-2 text-xs">(Deleted)</span>}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(txn.timestamp).time}
                </div>
              </Link>
            </td>

            {/* Amount column */}
            <td class={`whitespace-nowrap text-right ${isDeleted ? "text-gray-400" : ""}`}>
              <Link
                href={`/transactions/${txn.id}`}
                class={`text-sm font-medium hover:underline cursor-pointer ${
                  isDeleted ? "line-through text-gray-400" : `${typeDisplay.color} hover:opacity-80`
                }`}
                data-e2e="transaction-amount-link"
              >
                <div class="flex items-center justify-end gap-1">
                  {txn.originalCurrencyId && txn.originalAmount && (
                    <div title="Currency conversion">
                      <IconArrowPath class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                    </div>
                  )}
                  <CurrencyDisplay
                    amount={txn.amount}
                    currency={currencyId}
                  />
                </div>
              </Link>
              {txn.originalCurrencyId && txn.originalAmount && (
                <div class="text-xs text-gray-500 flex items-center justify-end gap-1">
                  <span>Original:</span>
                  <CurrencyDisplay
                    amount={txn.originalAmount}
                    currency={txn.originalCurrencyId}
                  />
                </div>
              )}
            </td>

            {/* Account/Category column */}
            <td class={`whitespace-nowrap ${isDeleted ? "text-gray-400" : ""}`}>
              <div
                class={`text-sm ${isDeleted ? "line-through" : "text-gray-900 dark:text-gray-100"}`}
              >
                {txn.type === TransactionType.TRANSFER
                  ? (
                    // Transfer: Show direction based on amount sign
                    <>
                      {(() => {
                        const linkedTransaction = getLinkedTransaction(txn)
                        if (txn.amount < 0) {
                          // Money out: This Account → Other Account
                          return (
                            <>
                              <Link
                                href={`/accounts/${txn.accountId}`}
                                class={isDeleted
                                  ? "text-gray-400 hover:underline"
                                  : "text-blue-600 dark:text-blue-400 hover:underline"}
                              >
                                {getAccountName(txn.accountId)}
                              </Link>
                              <span class="mx-2 text-gray-500">→</span>
                              {linkedTransaction
                                ? (
                                  <Link
                                    href={`/accounts/${linkedTransaction.accountId}`}
                                    class={isDeleted
                                      ? "text-gray-400 hover:underline"
                                      : "text-blue-600 dark:text-blue-400 hover:underline"}
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
                                    class={isDeleted
                                      ? "text-gray-400 hover:underline"
                                      : "text-blue-600 dark:text-blue-400 hover:underline"}
                                  >
                                    {getAccountName(linkedTransaction.accountId)}
                                  </Link>
                                )
                                : <span class="text-gray-400">Unknown Account</span>}
                              <span class="mx-2 text-gray-500">→</span>
                              <Link
                                href={`/accounts/${txn.accountId}`}
                                class={isDeleted
                                  ? "text-gray-400 hover:underline"
                                  : "text-blue-600 dark:text-blue-400 hover:underline"}
                              >
                                {getAccountName(txn.accountId)}
                              </Link>
                            </>
                          )
                        }
                      })()}
                    </>
                  )
                  : txn.type === TransactionType.INCOME
                  ? (
                    // INCOME: Show "Category → Account"
                    <>
                      {txn.categoryId
                        ? (
                          <Link
                            href={`/categories/${txn.categoryId}`}
                            class={isDeleted
                              ? "text-gray-400 hover:underline"
                              : "text-blue-600 dark:text-blue-400 hover:underline"}
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
                        class={isDeleted
                          ? "text-gray-400 hover:underline"
                          : "text-blue-600 dark:text-blue-400 hover:underline"}
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
                        class={isDeleted
                          ? "text-gray-400 hover:underline"
                          : "text-blue-600 dark:text-blue-400 hover:underline"}
                      >
                        {getAccountName(txn.accountId)}
                      </Link>
                      <span class="mx-2 text-gray-500">→</span>
                      {txn.categoryId
                        ? (
                          <Link
                            href={`/categories/${txn.categoryId}`}
                            class={isDeleted
                              ? "text-gray-400 hover:underline"
                              : "text-blue-600 dark:text-blue-400 hover:underline"}
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

            {/* Memo column */}
            <td class={`max-w-xs ${isDeleted ? "text-gray-400" : ""}`}>
              <div
                class={`text-sm truncate ${
                  isDeleted ? "line-through text-gray-400" : "text-gray-900 dark:text-gray-100"
                }`}
                title={txn.memo}
              >
                {txn.memo || "-"}
              </div>
            </td>

            {/* Actions column */}
            {showActions && (
              <td class="whitespace-nowrap text-right text-sm font-medium">
                <Dropdown
                  trigger={
                    <span
                      class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-2"
                      title="More actions"
                      data-e2e="transaction-actions-button"
                    >
                      <IconEllipsisVertical class="size-5" />
                    </span>
                  }
                  vertical={shouldDropdownOpenUp(index, transactions.value.length) ? "up" : "down"}
                >
                  <div class="py-1">
                    <button
                      onClick={() => (onEdit || handleDefaultEdit)(txn.id)}
                      type="button"
                      class="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      data-e2e="transaction-edit-link"
                    >
                      <IconPencilSquare class="size-4 mr-2" />
                      Edit
                    </button>
                    {txn.deletedAt
                      ? (
                        <button
                          onClick={() => (onUndelete || handleDefaultUndelete)(txn)}
                          type="button"
                          class="w-full flex items-center px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          disabled={transaction.ops.update.value.inProgress}
                        >
                          <IconTrashBin class="size-4 mr-2" />
                          Restore
                        </button>
                      )
                      : (
                        <button
                          onClick={() => (onDelete || handleDefaultDelete)(txn)}
                          type="button"
                          class="w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          disabled={transaction.ops.delete.value.inProgress}
                        >
                          <IconTrashBin class="size-4 mr-2" />
                          Delete
                        </button>
                      )}
                  </div>
                </Dropdown>
              </td>
            )}
          </>
        )
      })}
      footerSlot={currencyTotals.value.length > 0 && (
        <>
          {currencyTotals.value.map((total) => (
            <tr class="bg-gray-50 dark:bg-gray-700 font-medium">
              <td class="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                Total ({currency.getById(total.currencyId).code}):
              </td>
              <td class="px-6 py-3 text-sm text-right">
                <div class="space-y-1">
                  <div class="text-green-600 dark:text-green-400">
                    <CurrencyDisplay
                      amount={total.moneyIn}
                      currency={total.currencyId}
                    />
                    <span class="ml-1 text-xs">in</span>
                  </div>
                  <div class="text-red-600 dark:text-red-400">
                    <CurrencyDisplay
                      amount={-total.moneyOut}
                      currency={total.currencyId}
                    />
                    <span class="ml-1 text-xs">out</span>
                  </div>
                  <div class="border-t border-gray-300 dark:border-gray-600 pt-1 font-bold">
                    <CurrencyDisplay
                      amount={total.moneyIn - total.moneyOut}
                      currency={total.currencyId}
                      highlightNegative
                    />
                    <span class="ml-1 text-xs">net</span>
                  </div>
                </div>
              </td>
              <td colSpan={3}></td>
              {showActions && <td></td>}
            </tr>
          ))}
        </>
      )}
    />
  )
}
