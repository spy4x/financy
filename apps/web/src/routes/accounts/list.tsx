import { account } from "@web/state/account.ts"
import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { useComputed, useSignal } from "@preact/signals"
import {
  IconArrowRight,
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
import { CurrencySelector } from "@web/components/ui/CurrencySelector.tsx"
import { Link } from "wouter-preact"
import { routes } from "../_router.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { ItemStatus, ItemStatusUtils } from "@shared/types"
import type { Account } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"
import { useUrlFilters } from "@client/preact/use-url-filters.ts"

export function AccountList() {
  // URL-synced filters using the custom hook
  const { filters, clearFilters } = useUrlFilters({
    search: {
      signal: useSignal(""),
      initialValue: "",
      urlParam: "search",
    },
    currencyId: {
      signal: useSignal<number | null>(null),
      initialValue: null,
      urlParam: "currencyId",
      parser: (value) => value ? parseInt(value, 10) || null : null,
    },
    status: {
      signal: useSignal<ItemStatus>(ItemStatus.ACTIVE),
      initialValue: ItemStatus.ACTIVE,
      urlParam: "status",
      parser: (value) =>
        value && Object.values(ItemStatus).includes(value as ItemStatus)
          ? value as ItemStatus
          : ItemStatus.ACTIVE,
    },
  })

  const { search, currencyId, status } = filters

  const filteredAccounts = useComputed(() => {
    return account.list.value.filter((acc) => {
      // Filter by selected group
      if (acc.groupId !== group.selectedId.value) {
        return false
      }

      // Search filter
      if (
        search.value && typeof search.value === "string" &&
        !acc.name.toLowerCase().includes(search.value.toLowerCase())
      ) {
        return false
      }

      // Currency filter
      if (currencyId.value && acc.currencyId !== currencyId.value) {
        return false
      }

      // Status filter - default to ACTIVE if no status specified
      const effectiveStatus = status.value || ItemStatus.ACTIVE
      if (effectiveStatus !== ItemStatus.ALL && !ItemStatusUtils.matches(acc, effectiveStatus)) {
        return false
      }

      return true
    })
  })

  function handleDelete(acc: Account) {
    if (
      confirm(
        `Are you sure you want to delete the account "${acc.name}"? This will also delete all associated transactions.`,
      )
    ) {
      account.remove(acc.id)
    }
  }

  function handleUndelete(acc: Account) {
    if (
      confirm(
        `Are you sure you want to restore the account "${acc.name}"? This will also restore all associated transactions.`,
      )
    ) {
      account.undelete(acc.id)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle>Accounts</PageTitle>
      <div>
        <div class="space-y-4">
          <div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
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
                      placeholder="Search accounts..."
                      value={search.value || ""}
                      onInput={(e) => search.value = e.currentTarget.value}
                    />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <IconSearch class="size-5 text-gray-600 dark:text-gray-400" />
                    </span>
                  </div>
                </div>

                {/* Currency Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Currency
                  </label>
                  <CurrencySelector
                    value={typeof currencyId.value === "number" ? currencyId.value : null}
                    onChange={(id) => {
                      currencyId.value = id || null
                    }}
                    placeholder="All Currencies"
                  />
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
                    onInput={(e) => {
                      status.value = e.currentTarget.value as ItemStatus
                    }}
                  >
                    <option value={ItemStatus.ACTIVE}>Active</option>
                    <option value={ItemStatus.DELETED}>Deleted</option>
                    <option value={ItemStatus.ALL}>All</option>
                  </select>
                </div>

                {/* Clear Filters */}
                <div class="pt-2 border-t dark:border-gray-600">
                  <button
                    type="button"
                    class="btn btn-link text-sm w-full"
                    onClick={clearFilters}
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            </Dropdown>

            <Link
              href={routes.accounts.children!.create.href}
              class="btn btn-primary flex items-center gap-2"
            >
              <IconPlus class="size-5" />
              <span class="hidden md:inline">Create</span>
            </Link>
          </div>

          {filteredAccounts.value.length > 0 && (
            <Table
              headerSlot={
                <>
                  <th class="text-left">Name</th>
                  <th class="text-left">Currency</th>
                  <th class="text-left">Balance</th>
                  <th class="text-right">Actions</th>
                </>
              }
              bodySlots={filteredAccounts.value.map((acc, index) => (
                <>
                  <td class="whitespace-nowrap">
                    <div
                      class={`text-sm font-medium ${
                        acc.deletedAt
                          ? "text-gray-400 line-through"
                          : "text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {acc.name}
                      {acc.deletedAt && <span class="ml-2 text-xs text-red-500">(Deleted)</span>}
                    </div>
                  </td>
                  <td class="whitespace-nowrap">
                    <div
                      class={`text-sm flex items-center gap-2 ${
                        acc.deletedAt ? "text-gray-400" : "text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {(() => {
                        const currencyInfo = currency.getById(acc.currencyId)
                        return (
                          <>
                            <span class="font-mono font-medium">{currencyInfo.code}</span>
                            {currencyInfo.symbol && (
                              <span class="text-gray-500 dark:text-gray-400">
                                {currencyInfo.symbol}
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </td>
                  <td class="whitespace-nowrap">
                    <CurrencyDisplay
                      amount={account.getCurrentBalance(acc.id)}
                      currency={acc.currencyId}
                      highlightNegative={!acc.deletedAt}
                    />
                  </td>
                  <td class="whitespace-nowrap text-right text-sm font-medium">
                    <Dropdown
                      trigger={
                        <span
                          class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-2"
                          title="More actions"
                        >
                          <IconEllipsisVertical class="size-5" />
                        </span>
                      }
                      vertical={shouldDropdownOpenUp(index, filteredAccounts.value.length)
                        ? "up"
                        : "down"}
                    >
                      <div class="py-1">
                        {!acc.deletedAt && (
                          <>
                            <Link
                              href={`${routes.transactions.href}?accountId=${acc.id}`}
                              class="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              title="Find transactions for this account"
                            >
                              <IconSearch class="size-4 mr-2" />
                              Find Transactions
                            </Link>
                            <Link
                              href={`${
                                routes.transactions.children!.create.href
                              }?type=3&fromAccountId=${acc.id}`}
                              class="w-full flex items-center px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              title="Transfer money from this account"
                            >
                              <IconArrowRight class="size-4 mr-2" />
                              Transfer Money
                            </Link>
                          </>
                        )}
                        <Link
                          href={routes.accounts.children!.edit.href.replace(
                            ":id",
                            acc.id.toString(),
                          )}
                          class="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <IconPencilSquare class="size-4 mr-2" />
                          Edit
                        </Link>
                        {acc.deletedAt
                          ? (
                            <button
                              onClick={() => handleUndelete(acc)}
                              type="button"
                              class="w-full flex items-center px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              disabled={account.ops.update.value.inProgress}
                            >
                              <IconTrashBin class="size-4 mr-2" />
                              Restore
                            </button>
                          )
                          : (
                            <button
                              onClick={() => handleDelete(acc)}
                              type="button"
                              class="w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              disabled={account.ops.delete.value.inProgress}
                            >
                              <IconTrashBin class="size-4 mr-2" />
                              Delete
                            </button>
                          )}
                      </div>
                    </Dropdown>
                  </td>
                </>
              ))}
            />
          )}

          {filteredAccounts.value.length === 0 && (
            <div class="text-center py-8 text-gray-500 dark:text-gray-400">
              {search.value && typeof search.value === "string"
                ? "No accounts found matching your search."
                : "No accounts created yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
