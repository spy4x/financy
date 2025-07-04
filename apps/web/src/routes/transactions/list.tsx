import { transaction } from "@web/state/transaction.ts"
import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"
import { useComputed, useSignal } from "@preact/signals"
import { useUrlFilters } from "@client/preact/use-url-filters.ts"
import { IconFunnel, IconPlus, IconSearch } from "@client/icons"
import { TransactionTable } from "@web/components/TransactionTable.tsx"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { AccountSelector } from "@web/components/ui/AccountSelector.tsx"
import { Link } from "wouter-preact"
import { routes } from "../_router.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { ItemStatus, ItemStatusUtils, type Transaction, TransactionType } from "@shared/types"

export function TransactionList() {
  const { filters, clearFilters } = useUrlFilters({
    search: {
      signal: useSignal(""),
      initialValue: "",
      urlParam: "search",
    },
    status: {
      signal: useSignal<ItemStatus>(ItemStatus.ACTIVE),
      initialValue: ItemStatus.ACTIVE,
      urlParam: "status",
      parser: (value) =>
        value === "deleted"
          ? ItemStatus.DELETED
          : value === "all"
          ? ItemStatus.ALL
          : ItemStatus.ACTIVE,
    },
    type: {
      signal: useSignal<number | null>(null),
      initialValue: null,
      urlParam: "type",
      parser: (value) => {
        const parsed = value ? parseInt(value) : null
        return isNaN(parsed as number) ? null : parsed
      },
    },
    accountId: {
      signal: useSignal<number | null>(null),
      initialValue: null,
      urlParam: "accountId",
      parser: (value) => {
        const parsed = value ? parseInt(value) : null
        return isNaN(parsed as number) ? null : parsed
      },
    },
    categoryId: {
      signal: useSignal<number | null>(null),
      initialValue: null,
      urlParam: "categoryId",
      parser: (value) => {
        const parsed = value ? parseInt(value) : null
        return isNaN(parsed as number) ? null : parsed
      },
    },
    from: {
      signal: useSignal(""),
      initialValue: "",
      urlParam: "from",
    },
    to: {
      signal: useSignal(""),
      initialValue: "",
      urlParam: "to",
    },
  })

  const { search, status, type, accountId, categoryId, from, to } = filters

  const filteredTransactions = useComputed(() => {
    const transactions = transaction.list.value
    const selectedGroupId = group.selectedId.value

    // Filter by selected group and status first
    const groupTransactions = selectedGroupId
      ? transactions.filter((txn) =>
        txn.groupId === selectedGroupId && ItemStatusUtils.matches(txn, status.value)
      )
      : transactions.filter((txn) => ItemStatusUtils.matches(txn, status.value))

    let filtered = groupTransactions

    // Filter by account
    if (accountId.value !== null) {
      filtered = filtered.filter((txn) => txn.accountId === accountId.value)
    }

    // Filter by category
    if (categoryId.value !== null) {
      filtered = filtered.filter((txn) => txn.categoryId === categoryId.value)
    }

    // Filter by type
    if (type.value !== null) {
      filtered = filtered.filter((txn) => txn.type === type.value)
    }

    // Filter by search term
    if (search.value) {
      const searchLower = search.value.toLowerCase()
      filtered = filtered.filter((txn) => txn.memo?.toLowerCase().includes(searchLower))
    }

    // Filter by date and time range (ISO string)
    if (from.value) {
      const fromDate = new Date(from.value)
      filtered = filtered.filter((txn) => new Date(txn.timestamp).getTime() >= fromDate.getTime())
    }

    if (to.value) {
      const toDate = new Date(to.value)
      filtered = filtered.filter((txn) => new Date(txn.timestamp).getTime() <= toDate.getTime())
    }

    // Sort by transaction timestamp (newest first)
    return filtered.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  })

  // Get categories for current group (only active ones for filtering)
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

  return (
    <section class="page-layout">
      <PageTitle>Transactions</PageTitle>
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
              triggerDataE2E="transaction-filter-button"
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
                      value={search.value}
                      onInput={(e) => search.value = e.currentTarget.value}
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
                    key={status.value}
                    class="input w-full"
                    value={status.value}
                    onChange={(e) => {
                      status.value = e.currentTarget.value as ItemStatus
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
                    key={type.value}
                    class="input w-full"
                    value={type.value || ""}
                    onChange={(e) => {
                      const value = e.currentTarget.value
                      type.value = value ? parseInt(value) : null
                      // Clear category filter when switching to transfer type
                      if (value && parseInt(value) === TransactionType.TRANSFER) {
                        categoryId.value = null
                      }
                      // Clear to account filter when switching away from transfer
                      if (!value || parseInt(value) !== TransactionType.TRANSFER) {
                        accountId.value = null
                      }
                    }}
                  >
                    <option value="">All Types</option>
                    <option value="1">Expense</option>
                    <option value="2">Income</option>
                    <option value="3">Transfer</option>
                  </select>
                </div>

                {/* From Account Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {type.value === TransactionType.TRANSFER ? "From Account" : "Account"}
                  </label>
                  <AccountSelector
                    value={accountId.value}
                    onChange={(id) => accountId.value = id}
                    placeholder="All Accounts"
                  />
                </div>

                {/* Category Filter - hide for transfers */}
                {type.value !== TransactionType.TRANSFER && (
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <select
                      key={categoryId.value}
                      class="input w-full"
                      value={categoryId.value || ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value
                        categoryId.value = value ? parseInt(value) : null
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

                {/* Date & Time Filters */}
                <div class="flex flex-col gap-2">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      From
                    </label>
                    <input
                      type="datetime-local"
                      class="input w-full"
                      value={from.value}
                      onInput={(e) => from.value = e.currentTarget.value}
                      step="60"
                      placeholder="--"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      To
                    </label>
                    <input
                      type="datetime-local"
                      class="input w-full"
                      value={to.value}
                      onInput={(e) => to.value = e.currentTarget.value}
                      step="60"
                      placeholder="--"
                    />
                  </div>
                </div>

                {/* Clear Filters */}
                <div class="pt-2 border-t">
                  <button
                    type="button"
                    class="btn btn-link text-sm w-full"
                    onClick={() => {
                      clearFilters()
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
              data-e2e="transaction-create-button"
            >
              <IconPlus class="size-5" />
              <span class="hidden md:inline">Create</span>
            </Link>
          </div>

          {filteredTransactions.value.length > 0 && (
            <TransactionTable
              transactions={filteredTransactions}
              onDelete={handleDelete}
              onUndelete={handleUndelete}
              dataE2E="transaction-row"
            />
          )}

          {filteredTransactions.value.length === 0 && (
            <div class="text-center py-8 text-gray-500">
              {search.value || accountId.value !== null ||
                  categoryId.value !== null || type.value !== null ||
                  from.value || to.value ||
                  status.value !== ItemStatus.ACTIVE
                ? "No transactions found matching your filters."
                : "No transactions created yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
