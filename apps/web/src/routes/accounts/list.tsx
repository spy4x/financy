import { account } from "@web/state/account.ts"
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
import type { Account } from "@shared/types"
import { getCurrencyDisplay } from "@shared/constants/currency.ts"

export function AccountList() {
  const search = useSignal("")

  const filteredAccounts = useComputed(() => {
    const accounts = account.list.value
    const selectedGroupId = group.selectedId.value

    // Filter by selected group first
    const groupAccounts = selectedGroupId
      ? accounts.filter((acc) => acc.groupId === selectedGroupId)
      : accounts

    // Then filter by search term
    if (!search.value) return groupAccounts
    return groupAccounts.filter((acc) =>
      acc.name.toLowerCase().includes(search.value.toLowerCase())
    )
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

  function formatBalance(balance: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(balance / 100) // Convert from cents to currency units
  }

  return (
    <section class="page-layout">
      <PageTitle>Accounts</PageTitle>
      <div>
        {group.selectedId.value && (
          <div class="mb-4 text-sm text-gray-600">
            Showing accounts for group:{" "}
            <span class="font-medium text-gray-900">
              {group.list.value.find((g) => g.id === group.selectedId.value)?.name ||
                "Unknown Group"}
            </span>
          </div>
        )}

        <div class="space-y-4">
          <div class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div class="relative">
              <input
                class="input w-full pr-10"
                placeholder="Search accounts..."
                value={search.value}
                onInput={(e) => search.value = e.currentTarget.value}
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <IconSearch class="size-5 text-gray-600" />
              </span>
            </div>

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
              <span class="hidden md:inline">Create Account</span>
            </Link>
          </div>

          {filteredAccounts.value.length > 0 && (
            <Table
              headerSlot={
                <>
                  <th>Name</th>
                  <th>Currency</th>
                  <th>Balance</th>
                  <th>Actions</th>
                </>
              }
              bodySlots={filteredAccounts.value.map((acc) => (
                <>
                  <td class="whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">{acc.name}</div>
                  </td>
                  <td class="whitespace-nowrap">
                    <div class="text-sm text-gray-900 flex items-center gap-2">
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
                    <div class="text-sm text-gray-900">
                      {formatBalance(acc.balance, acc.currency)}
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
                          href={routes.accounts.children!.edit.href.replace(
                            ":id",
                            acc.id.toString(),
                          )}
                          class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <IconPencilSquare class="size-4 mr-2" />
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(acc)}
                          type="button"
                          class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                          disabled={account.ops.delete.value.inProgress}
                        >
                          <IconTrashBin class="size-4 mr-2" />
                          Delete
                        </button>
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
                : search.value
                ? "No accounts found matching your search."
                : "No accounts created yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
