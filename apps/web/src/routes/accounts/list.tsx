import { account } from "@web/state/account.ts"
import { group } from "@web/state/group.ts"
import { useComputed, useSignal } from "@preact/signals"
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
import { CurrencySelector } from "@web/components/ui/CurrencySelector.tsx"
import { getCurrencyDisplay } from "@shared/constants/currency.ts"
import { Link } from "wouter-preact"
import { routes } from "../_router.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { ItemStatus, ItemStatusUtils } from "@shared/types"
import type { Account } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"

export function AccountList() {
  const filter = {
    search: useSignal(""),
    currency: useSignal<string | null>(null),
    status: useSignal<ItemStatus>(ItemStatus.ACTIVE),
  }

  const filteredAccounts = useComputed(() => {
    return account.list.value.filter((acc) => {
      // Filter by selected group first
      if (group.selectedId.value && acc.groupId !== group.selectedId.value) {
        return false
      }

      // Search filter
      if (!acc.name.toLowerCase().includes(filter.search.value.toLowerCase())) {
        return false
      }

      // Currency filter
      if (filter.currency.value && acc.currency !== filter.currency.value) {
        return false
      }

      // Status filter
      if (!ItemStatusUtils.matches(acc, filter.status.value)) {
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
      <PageTitle showGroupSelector>Accounts</PageTitle>
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
                  <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
                  <div class="relative">
                    <input
                      class="input w-full pr-10"
                      placeholder="Search accounts..."
                      value={filter.search.value}
                      onInput={(e) => filter.search.value = e.currentTarget.value}
                    />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      <IconSearch class="size-5 text-gray-600" />
                    </span>
                  </div>
                </div>

                {/* Currency Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <CurrencySelector
                    value={filter.currency.value || ""}
                    onChange={(code) => filter.currency.value = code || null}
                    placeholder="All Currencies"
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    class="input w-full"
                    value={filter.status.value}
                    onChange={(e) => filter.status.value = e.currentTarget.value as ItemStatus}
                  >
                    <option value={ItemStatus.ACTIVE}>Active</option>
                    <option value={ItemStatus.DELETED}>Deleted</option>
                    <option value={ItemStatus.ALL}>All</option>
                  </select>
                </div>

                {/* Clear Filters */}
                <div class="pt-2 border-t">
                  <button
                    type="button"
                    class="btn btn-link text-sm w-full"
                    onClick={() => {
                      filter.search.value = ""
                      filter.currency.value = null
                      filter.status.value = ItemStatus.ACTIVE
                    }}
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            </Dropdown>

            <Link
              title={group.selectedId.value ? "Create Account" : "Please select a group first"}
              href={routes.accounts.children!.create.href}
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

          {filteredAccounts.value.length > 0 && (
            <Table
              headerSlot={
                <>
                  <th class="text-left">Name</th>
                  <th class="text-left">Currency</th>
                  <th class="text-left">Balance</th>
                  <th>Actions</th>
                </>
              }
              bodySlots={filteredAccounts.value.map((acc, index) => (
                <>
                  <td class="whitespace-nowrap">
                    <div
                      class={`text-sm font-medium ${
                        acc.deletedAt ? "text-gray-400 line-through" : "text-gray-900"
                      }`}
                    >
                      {acc.name}
                      {acc.deletedAt && <span class="ml-2 text-xs text-red-500">(Deleted)</span>}
                    </div>
                  </td>
                  <td class="whitespace-nowrap">
                    <div
                      class={`text-sm flex items-center gap-2 ${
                        acc.deletedAt ? "text-gray-400" : "text-gray-900"
                      }`}
                    >
                      {(() => {
                        const currencyInfo = getCurrencyDisplay(acc.currency)
                        return (
                          <>
                            <span class="font-mono font-medium">{currencyInfo.code}</span>
                            {currencyInfo.symbol && (
                              <span class="text-gray-500">{currencyInfo.symbol}</span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </td>
                  <td class="whitespace-nowrap">
                    <div class={`text-sm ${acc.deletedAt ? "text-gray-400" : "text-gray-900"}`}>
                      <CurrencyDisplay
                        amount={acc.balance}
                        currency={acc.currency}
                        highlightNegative={!acc.deletedAt}
                      />
                    </div>
                  </td>
                  <td class="whitespace-nowrap text-right text-sm font-medium">
                    <Dropdown
                      trigger={
                        <span class="text-gray-400 hover:text-gray-600 p-2" title="More actions">
                          <IconEllipsisVertical class="size-5" />
                        </span>
                      }
                      vertical={shouldDropdownOpenUp(index, filteredAccounts.value.length)
                        ? "up"
                        : "down"}
                    >
                      <div class="py-1">
                        <Link
                          href={routes.accounts.children!.edit.href.replace(
                            ":id",
                            acc.id.toString(),
                          )}
                          class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <IconPencilSquare class="size-4 mr-2" />
                          Edit
                        </Link>
                        {acc.deletedAt
                          ? (
                            <button
                              onClick={() => handleUndelete(acc)}
                              type="button"
                              class="w-full flex items-center px-4 py-2 text-sm text-green-600 hover:bg-gray-100"
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
                              class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
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
            <div class="text-center py-8 text-gray-500">
              {!group.selectedId.value
                ? "Please select a group first to view accounts."
                : filter.search.value
                ? "No accounts found matching your search."
                : "No accounts created yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
