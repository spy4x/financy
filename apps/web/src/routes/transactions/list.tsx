import { transaction } from "@web/state/transaction.ts"
import { account } from "@web/state/account.ts"
import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"
import { useComputed, useSignal } from "@preact/signals"
import {
  IconEllipsisVertical,
  IconPencilSquare,
  IconPlus,
  IconSearch,
  IconTrashBin,
} from "@client/icons"
import { Table } from "@web/components/ui/Table.tsx"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { Link } from "wouter-preact"
import { routes } from "../_router.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import type { Transaction } from "@shared/types"
import { getCurrencyDisplay } from "@shared/constants/currency.ts"

export function TransactionList() {
  const search = useSignal("")
  const selectedAccountId = useSignal<number | null>(null)
  const selectedCategoryId = useSignal<number | null>(null)
  const selectedType = useSignal<number | null>(null)

  const filteredTransactions = useComputed(() => {
    const transactions = transaction.list.value
    const selectedGroupId = group.selectedId.value

    // Filter by selected group first
    const groupTransactions = selectedGroupId
      ? transactions.filter((txn) => txn.groupId === selectedGroupId)
      : transactions

    let filtered = groupTransactions

    // Filter by account
    if (selectedAccountId.value !== null) {
      filtered = filtered.filter((txn) => txn.accountId === selectedAccountId.value)
    }

    // Filter by category
    if (selectedCategoryId.value !== null) {
      filtered = filtered.filter((txn) => txn.categoryId === selectedCategoryId.value)
    }

    // Filter by type
    if (selectedType.value !== null) {
      filtered = filtered.filter((txn) => txn.type === selectedType.value)
    }

    // Filter by search term
    if (search.value) {
      const searchLower = search.value.toLowerCase()
      filtered = filtered.filter((txn) => txn.memo?.toLowerCase().includes(searchLower))
    }

    // Sort by creation date (newest first)
    return filtered.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  })

  // Get accounts and categories for current group
  const groupAccounts = useComputed(() => {
    const selectedGroupId = group.selectedId.value
    return selectedGroupId
      ? account.list.value.filter((acc) => acc.groupId === selectedGroupId)
      : []
  })

  const groupCategories = useComputed(() => {
    const selectedGroupId = group.selectedId.value
    return selectedGroupId
      ? category.list.value.filter((cat) => cat.groupId === selectedGroupId)
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

  function formatAmount(amount: number, currency: string): { symbol: string; amount: string } {
    const currencyInfo = getCurrencyDisplay(currency)
    const formattedAmount = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount / 100) // Convert from cents to currency units

    return {
      symbol: currencyInfo.symbol || currencyInfo.code,
      amount: formattedAmount,
    }
  }

  function getAccountName(accountId: number): string {
    const acc = account.list.value.find((a) => a.id === accountId)
    return acc?.name || "Unknown Account"
  }

  function getCategoryName(categoryId: number): string {
    const cat = category.list.value.find((c) => c.id === categoryId)
    return cat?.name || "Unknown Category"
  }

  function getTransactionTypeDisplay(type: number): { label: string; color: string } {
    return type === 1
      ? { label: "Debit", color: "text-red-600" }
      : { label: "Credit", color: "text-green-600" }
  }

  return (
    <section class="page-layout">
      <PageTitle>Transactions</PageTitle>
      <div>
        {group.selectedId.value && (
          <div class="mb-4 text-sm text-gray-600">
            Showing transactions for group:{" "}
            <span class="font-medium text-gray-900">
              {group.list.value.find((g) => g.id === group.selectedId.value)?.name ||
                "Unknown Group"}
            </span>
          </div>
        )}

        <div class="space-y-4">
          {/* Search and Create Row */}
          <div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div class="relative flex-1 max-w-md">
              <input
                class="input w-full pr-10"
                placeholder="Search transactions..."
                value={search.value}
                onInput={(e) => search.value = e.currentTarget.value}
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <IconSearch class="size-5 text-gray-600" />
              </span>
            </div>

            <Link
              title={group.selectedId.value ? "Create Transaction" : "Please select a group first"}
              href={routes.transactions.children!.create.href}
              class={`btn flex items-center gap-2 ${
                group.selectedId.value ? "btn-primary" : "btn-disabled cursor-not-allowed"
              }`}
              onClick={(e) => {
                if (!group.selectedId.value) {
                  e.preventDefault()
                }
              }}
            >
              <IconPlus class="size-5" />
              <span class="hidden md:inline">Create</span>
            </Link>
          </div>

          {/* Filters Row */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Account</label>
              <select
                class="input"
                value={selectedAccountId.value || ""}
                onChange={(e) => {
                  const value = e.currentTarget.value
                  selectedAccountId.value = value ? parseInt(value) : null
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

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                class="input"
                value={selectedCategoryId.value || ""}
                onChange={(e) => {
                  const value = e.currentTarget.value
                  selectedCategoryId.value = value ? parseInt(value) : null
                }}
              >
                <option value="">All Categories</option>
                {groupCategories.value.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                class="input"
                value={selectedType.value || ""}
                onChange={(e) => {
                  const value = e.currentTarget.value
                  selectedType.value = value ? parseInt(value) : null
                }}
              >
                <option value="">All Types</option>
                <option value="1">Debit</option>
                <option value="2">Credit</option>
              </select>
            </div>

            <div class="flex items-end">
              <button
                type="button"
                class="btn btn-link text-sm"
                onClick={() => {
                  selectedAccountId.value = null
                  selectedCategoryId.value = null
                  selectedType.value = null
                  search.value = ""
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>

          {filteredTransactions.value.length > 0 && (
            <Table
              headerSlot={
                <>
                  <th class="text-left">Date</th>
                  <th class="text-left">Account &gt; Category</th>
                  <th class="text-left">Amount</th>
                  <th class="text-left">Memo</th>
                  <th>Actions</th>
                </>
              }
              bodySlots={filteredTransactions.value.map((txn) => {
                const typeDisplay = getTransactionTypeDisplay(txn.type)
                const acc = account.list.value.find((a) => a.id === txn.accountId)
                const currency = acc?.currency || "USD"

                return (
                  <>
                    <td class="whitespace-nowrap">
                      <div class="text-sm text-gray-900">
                        {new Date(txn.createdAt).toLocaleDateString()}
                      </div>
                      <div class="text-xs text-gray-500">
                        {new Date(txn.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td class="whitespace-nowrap">
                      <div class="text-sm text-gray-900">
                        <Link
                          href={routes.accounts.children!.edit.href.replace(
                            ":id",
                            txn.accountId.toString(),
                          )}
                          class="text-blue-600 hover:underline"
                        >
                          {getAccountName(txn.accountId)}
                        </Link>
                        {" > "}
                        <Link
                          href={routes.categories.children!.edit.href.replace(
                            ":id",
                            txn.categoryId.toString(),
                          )}
                          class="text-blue-600 hover:underline"
                        >
                          {getCategoryName(txn.categoryId)}
                        </Link>
                      </div>
                    </td>
                    <td class="whitespace-nowrap">
                      <div class={`text-sm font-medium ${typeDisplay.color}`}>
                        {(() => {
                          const formattedAmount = formatAmount(txn.amount, currency)
                          return (
                            <>
                              <span class="font-medium">{formattedAmount.symbol}</span>{" "}
                              <span>{formattedAmount.amount}</span>
                            </>
                          )
                        })()}
                      </div>
                      {txn.originalCurrency && txn.originalAmount && (
                        <div class="text-xs text-gray-500">
                          {(() => {
                            const formattedOriginalAmount = formatAmount(
                              txn.originalAmount,
                              txn.originalCurrency,
                            )
                            return (
                              <>
                                <span class="font-medium">{formattedOriginalAmount.symbol}</span>
                                {" "}
                                <span>{formattedOriginalAmount.amount}</span>
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </td>
                    <td class="max-w-xs">
                      <div class="text-sm text-gray-900 truncate" title={txn.memo}>
                        {txn.memo || "-"}
                      </div>
                    </td>
                    <td class="whitespace-nowrap text-right text-sm font-medium">
                      <Dropdown
                        button={
                          <span class="text-gray-400 hover:text-gray-600 p-2" title="More actions">
                            <IconEllipsisVertical class="size-5" />
                          </span>
                        }
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
                          <button
                            onClick={() => handleDelete(txn)}
                            type="button"
                            class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                            disabled={transaction.ops.delete.value.inProgress}
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
          )}

          {filteredTransactions.value.length === 0 && (
            <div class="text-center py-8 text-gray-500">
              {!group.selectedId.value
                ? "Please select a group first to view transactions."
                : search.value || selectedAccountId.value !== null ||
                    selectedCategoryId.value !== null || selectedType.value !== null
                ? "No transactions found matching your filters."
                : "No transactions created yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
