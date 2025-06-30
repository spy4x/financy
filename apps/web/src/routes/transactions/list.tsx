import { transaction } from "@web/state/transaction.ts"
import { account } from "@web/state/account.ts"
import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"
import { useComputed, useSignal, useSignalEffect } from "@preact/signals"
import {
  IconEllipsisVertical,
  IconFunnel,
  IconPencilSquare,
  IconPlus,
  IconSearch,
  IconTrashBin,
} from "@client/icons"
import { Table } from "@web/components/ui/Table.tsx"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { Link } from "wouter-preact"
import { routes } from "../_router.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { ItemStatus, ItemStatusUtils, type Transaction, TransactionType } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"

export function TransactionList() {
  const filter = {
    search: useSignal(""),
    status: useSignal<ItemStatus>(ItemStatus.ACTIVE),
    type: useSignal<number | null>(null),
    accountId: useSignal<number | null>(null),
    categoryId: useSignal<number | null>(null),
    from: useSignal(""),
    to: useSignal(""),
  }

  // Initialize filters from URL parameters
  useSignalEffect(() => {
    const urlParams = new URLSearchParams(globalThis.location.search)
    const categoryIdParam = urlParams.get("categoryId")

    if (categoryIdParam) {
      const categoryId = parseInt(categoryIdParam, 10)
      if (!isNaN(categoryId)) {
        filter.categoryId.value = categoryId
      }
    }
  })

  const filteredTransactions = useComputed(() => {
    const transactions = transaction.list.value
    const selectedGroupId = group.selectedId.value

    // Filter by selected group and status first
    const groupTransactions = selectedGroupId
      ? transactions.filter((txn) =>
        txn.groupId === selectedGroupId && ItemStatusUtils.matches(txn, filter.status.value)
      )
      : transactions.filter((txn) => ItemStatusUtils.matches(txn, filter.status.value))

    let filtered = groupTransactions

    // Filter by account
    if (filter.accountId.value !== null) {
      filtered = filtered.filter((txn) => txn.accountId === filter.accountId.value)
    }

    // Filter by category
    if (filter.categoryId.value !== null) {
      filtered = filtered.filter((txn) => txn.categoryId === filter.categoryId.value)
    }

    // Filter by type
    if (filter.type.value !== null) {
      filtered = filtered.filter((txn) => txn.type === filter.type.value)
    }

    // Filter by search term
    if (filter.search.value) {
      const searchLower = filter.search.value.toLowerCase()
      filtered = filtered.filter((txn) => txn.memo?.toLowerCase().includes(searchLower))
    }

    // Filter by date range
    if (filter.from.value) {
      const fromDate = new Date(filter.from.value)
      fromDate.setHours(0, 0, 0, 0) // Start of day
      filtered = filtered.filter((txn) => new Date(txn.timestamp).getTime() >= fromDate.getTime())
    }

    if (filter.to.value) {
      const toDate = new Date(filter.to.value)
      toDate.setHours(23, 59, 59, 999) // End of day
      filtered = filtered.filter((txn) => new Date(txn.timestamp).getTime() <= toDate.getTime())
    }

    // Sort by transaction timestamp (newest first)
    return filtered.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  })

  // Get accounts and categories for current group (only active ones for filtering)
  const groupAccounts = useComputed(() => {
    const selectedGroupId = group.selectedId.value
    return selectedGroupId
      ? account.list.value.filter((acc) => acc.groupId === selectedGroupId && !acc.deletedAt)
      : []
  })

  const groupCategories = useComputed(() => {
    const selectedGroupId = group.selectedId.value
    return selectedGroupId
      ? category.list.value.filter((cat) => cat.groupId === selectedGroupId && !cat.deletedAt)
      : []
  })

  function handleDelete(txn: Transaction) {
    if (
      confirm(
        `Are you sure you want to delete this transaction? This action cannot be undone.`,
      )
    ) {
      transaction.remove(txn.id)
    }
  }

  function handleUndelete(txn: Transaction) {
    transaction.undelete(txn.id)
  }

  function getAccountName(accountId: number): string {
    const acc = account.list.value.find((a) => a.id === accountId)
    return acc?.name || "Unknown Account"
  }

  function getCategoryDisplay(categoryId: number): { name: string; icon?: string; color?: string } {
    const cat = category.list.value.find((c) => c.id === categoryId)
    return {
      name: cat?.name || "Unknown Category",
      icon: cat?.icon || undefined,
      color: cat?.color || undefined,
    }
  }

  function getTransactionTypeDisplay(type: number): { label: string; color: string } {
    switch (type) {
      case TransactionType.DEBIT:
        return { label: "Debit", color: "text-red-600" }
      case TransactionType.CREDIT:
        return { label: "Credit", color: "text-green-600" }
      case TransactionType.TRANSFER:
        return { label: "Transfer", color: "text-blue-600" }
      default:
        return { label: "Unknown", color: "text-gray-600" }
    }
  }

  return (
    <section class="page-layout">
      <PageTitle showGroupSelector>Transactions</PageTitle>
      <div>
        <div class="space-y-4">
          {/* Filter and Create Row */}
          <div class="flex items-center justify-between">
            <Dropdown
              trigger={
                <>
                  <IconFunnel class="size-5" />
                  Filter
                </>
              }
              triggerClasses="btn btn-primary-outline flex items-center gap-2"
              panelClasses="left-0 right-auto"
              horizontal="left"
            >
              <div class="p-4 w-80 space-y-4">
                {/* Search */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Search
                  </label>
                  <div class="relative">
                    <input
                      class="input w-full pr-10"
                      placeholder="Search transactions..."
                      value={filter.search.value}
                      onInput={(e) => filter.search.value = e.currentTarget.value}
                    />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      <IconSearch class="size-5 text-gray-600" />
                    </span>
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status
                  </label>
                  <select
                    class="input w-full"
                    value={filter.status.value}
                    onChange={(e) => {
                      filter.status.value = e.currentTarget.value as ItemStatus
                    }}
                  >
                    <option value={ItemStatus.ACTIVE}>Active</option>
                    <option value={ItemStatus.DELETED}>Deleted</option>
                    <option value={ItemStatus.ALL}>All</option>
                  </select>
                </div>

                {/* Type Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <select
                    class="input w-full"
                    value={filter.type.value || ""}
                    onChange={(e) => {
                      const value = e.currentTarget.value
                      filter.type.value = value ? parseInt(value) : null
                      // Clear category filter when switching to transfer type
                      if (value && parseInt(value) === TransactionType.TRANSFER) {
                        filter.categoryId.value = null
                      }
                      // Clear to account filter when switching away from transfer
                      if (!value || parseInt(value) !== TransactionType.TRANSFER) {
                        filter.accountId.value = null
                      }
                    }}
                  >
                    <option value="">All Types</option>
                    <option value="1">Debit</option>
                    <option value="2">Credit</option>
                    <option value="3">Transfer</option>
                  </select>
                </div>

                {/* From Account Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {filter.type.value === TransactionType.TRANSFER ? "From Account" : "Account"}
                  </label>
                  <select
                    class="input w-full"
                    value={filter.accountId.value || ""}
                    onChange={(e) => {
                      const value = e.currentTarget.value
                      filter.accountId.value = value ? parseInt(value) : null
                    }}
                  >
                    <option value="">All Accounts</option>
                    {groupAccounts.value.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Filter - hide for transfers */}
                {filter.type.value !== TransactionType.TRANSFER && (
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <select
                      class="input w-full"
                      value={filter.categoryId.value || ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value
                        filter.categoryId.value = value ? parseInt(value) : null
                      }}
                    >
                      <option value="">All Categories</option>
                      {groupCategories.value.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon ? `${cat.icon} ` : ""}
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date Filters */}
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      From Date
                    </label>
                    <input
                      type="date"
                      class="input w-full"
                      value={filter.from.value}
                      onInput={(e) => filter.from.value = e.currentTarget.value}
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      To Date
                    </label>
                    <input
                      type="date"
                      class="input w-full"
                      value={filter.to.value}
                      onInput={(e) => filter.to.value = e.currentTarget.value}
                    />
                  </div>
                </div>

                {/* Clear Filters */}
                <div class="pt-2 border-t">
                  <button
                    type="button"
                    class="btn btn-link text-sm w-full"
                    onClick={() => {
                      filter.accountId.value = null
                      filter.categoryId.value = null
                      filter.type.value = null
                      filter.search.value = ""
                      filter.from.value = ""
                      filter.to.value = ""
                      filter.status.value = ItemStatus.ACTIVE
                    }}
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            </Dropdown>

            <Link
              href={routes.transactions.children!.create.href}
              class="btn btn-primary flex items-center gap-2"
            >
              <IconPlus class="size-5" />
              <span class="hidden md:inline">Create</span>
            </Link>
          </div>

          {filteredTransactions.value.length > 0 && (
            <Table
              headerSlot={
                <>
                  <th class="text-left">Date</th>
                  <th class="text-left">Account / Destination</th>
                  <th class="text-left">Amount</th>
                  <th class="text-left">Memo</th>
                  <th>Actions</th>
                </>
              }
              bodySlots={filteredTransactions.value.map((txn, index) => {
                const typeDisplay = getTransactionTypeDisplay(txn.type)
                const acc = account.list.value.find((a) => a.id === txn.accountId)
                const currencyId = acc?.currencyId || 1 // Default to currency ID 1 (USD)
                const isDeleted = !!txn.deletedAt

                return (
                  <>
                    <td class={`whitespace-nowrap ${isDeleted ? "text-gray-400" : ""}`}>
                      <div
                        class={`text-sm ${
                          isDeleted ? "line-through" : "text-gray-900 dark:text-gray-100"
                        }`}
                      >
                        {new Date(txn.timestamp).toLocaleDateString()}
                        {isDeleted && <span class="ml-2 text-xs">(Deleted)</span>}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(txn.timestamp).toLocaleTimeString()}
                      </div>
                    </td>
                    <td class={`whitespace-nowrap ${isDeleted ? "text-gray-400" : ""}`}>
                      <div
                        class={`text-sm ${
                          isDeleted ? "line-through" : "text-gray-900 dark:text-gray-100"
                        }`}
                      >
                        {txn.type === TransactionType.TRANSFER
                          ? (
                            // Transfer: Show direction based on amount sign
                            <>
                              {(() => {
                                // Find the linked transaction to get the other account
                                const linkedTransaction = txn.linkedTransactionCode
                                  ? transaction.list.value.find((t) =>
                                    t.linkedTransactionCode === txn.linkedTransactionCode &&
                                    t.id !== txn.id
                                  )
                                  : null

                                if (txn.amount < 0) {
                                  // Money out: This Account → Other Account
                                  return (
                                    <>
                                      <Link
                                        href={routes.accounts.children!.edit.href.replace(
                                          ":id",
                                          txn.accountId.toString(),
                                        )}
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
                                            href={routes.accounts.children!.edit.href.replace(
                                              ":id",
                                              linkedTransaction.accountId.toString(),
                                            )}
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
                                            href={routes.accounts.children!.edit.href.replace(
                                              ":id",
                                              linkedTransaction.accountId.toString(),
                                            )}
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
                                        href={routes.accounts.children!.edit.href.replace(
                                          ":id",
                                          txn.accountId.toString(),
                                        )}
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
                          : (
                            // Regular transaction: Show "Account > Category"
                            <>
                              <Link
                                href={routes.accounts.children!.edit.href.replace(
                                  ":id",
                                  txn.accountId.toString(),
                                )}
                                class={isDeleted
                                  ? "text-gray-400 hover:underline"
                                  : "text-blue-600 dark:text-blue-400 hover:underline"}
                              >
                                {getAccountName(txn.accountId)}
                              </Link>
                              {" > "}
                              {txn.categoryId
                                ? (
                                  <Link
                                    href={routes.categories.children!.edit.href.replace(
                                      ":id",
                                      txn.categoryId.toString(),
                                    )}
                                    class={isDeleted
                                      ? "text-gray-400 hover:underline"
                                      : "text-blue-600 dark:text-blue-400 hover:underline"}
                                  >
                                    {(() => {
                                      const categoryDisplay = getCategoryDisplay(txn.categoryId)
                                      return (
                                        <span class="flex items-center gap-1">
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
                    <td class={`whitespace-nowrap ${isDeleted ? "text-gray-400" : ""}`}>
                      <div
                        class={`text-sm font-medium ${
                          isDeleted ? "line-through text-gray-400" : typeDisplay.color
                        }`}
                      >
                        <CurrencyDisplay
                          amount={txn.amount}
                          currency={currencyId}
                        />
                      </div>
                      {txn.originalCurrencyId && txn.originalAmount && (
                        <div class="text-xs text-gray-500">
                          <CurrencyDisplay
                            amount={txn.originalAmount}
                            currency={txn.originalCurrencyId}
                          />
                        </div>
                      )}
                    </td>
                    <td class={`max-w-xs ${isDeleted ? "text-gray-400" : ""}`}>
                      <div
                        class={`text-sm truncate ${
                          isDeleted ? "line-through text-gray-400" : "text-gray-900"
                        }`}
                        title={txn.memo}
                      >
                        {txn.memo || "-"}
                      </div>
                    </td>
                    <td class="whitespace-nowrap text-right text-sm font-medium">
                      <Dropdown
                        trigger={
                          <span class="text-gray-400 hover:text-gray-600 p-2" title="More actions">
                            <IconEllipsisVertical class="size-5" />
                          </span>
                        }
                        vertical={shouldDropdownOpenUp(index, filteredTransactions.value.length)
                          ? "up"
                          : "down"}
                      >
                        <div class="py-1">
                          <Link
                            href={routes.transactions.children!.edit.href.replace(
                              ":id",
                              txn.id.toString(),
                            )}
                            class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            <IconPencilSquare class="size-4 mr-2" />
                            Edit
                          </Link>
                          {txn.deletedAt
                            ? (
                              <button
                                onClick={() => handleUndelete(txn)}
                                type="button"
                                class="w-full flex items-center px-4 py-2 text-sm text-green-600 hover:bg-gray-100"
                                disabled={transaction.ops.update.value.inProgress}
                              >
                                <IconTrashBin class="size-4 mr-2" />
                                Restore
                              </button>
                            )
                            : (
                              <button
                                onClick={() => handleDelete(txn)}
                                type="button"
                                class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                disabled={transaction.ops.delete.value.inProgress}
                              >
                                <IconTrashBin class="size-4 mr-2" />
                                Delete
                              </button>
                            )}
                        </div>
                      </Dropdown>
                    </td>
                  </>
                )
              })}
            />
          )}

          {filteredTransactions.value.length === 0 && (
            <div class="text-center py-8 text-gray-500">
              {filter.search.value || filter.accountId.value !== null ||
                  filter.categoryId.value !== null || filter.type.value !== null ||
                  filter.from.value || filter.to.value ||
                  filter.status.value !== ItemStatus.ACTIVE
                ? "No transactions found matching your filters."
                : "No transactions created yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
