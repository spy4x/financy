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
import { CurrencySelector } from "@web/components/ui/CurrencySelector.tsx"
import { Link } from "wouter-preact"
import { routes } from "../_router.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import type { Group } from "@shared/types"

export function GroupList() {
  const filter = {
    search: useSignal(""),
    currency: useSignal<string | null>(null),
    status: useSignal<string | null>(null), // "active" or "deleted"
  }

  const filteredGroups = useComputed(() => {
    return group.list.value.filter((grp) => {
      // Search filter
      if (!grp.name.toLowerCase().includes(filter.search.value.toLowerCase())) {
        return false
      }

      // Currency filter
      if (filter.currency.value && grp.defaultCurrency !== filter.currency.value) {
        return false
      }

      // Status filter
      if (filter.status.value) {
        if (filter.status.value === "active" && grp.deletedAt) {
          return false
        }
        if (filter.status.value === "deleted" && !grp.deletedAt) {
          return false
        }
      }

      return true
    })
  })

  function handleDelete(grp: Group) {
    if (
      confirm(
        `Are you sure you want to delete the group "${grp.name}"? This will delete all associated accounts, categories, and transactions.`,
      )
    ) {
      group.remove(grp.id)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle>Groups</PageTitle>
      <div>
        <div class="flex items-center justify-between mb-6">
          <Dropdown
            button={
              <>
                <IconFunnel class="size-5" />
                Filter
              </>
            }
            buttonClass="btn btn-primary-outline flex items-center gap-2"
            extraClass="left-0 right-auto"
          >
            <div class="p-4 w-80 space-y-4">
              {/* Search */}
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div class="relative">
                  <input
                    class="input w-full pr-10"
                    placeholder="Search groups..."
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
                  value={filter.status.value || ""}
                  onChange={(e) => {
                    const value = e.currentTarget.value
                    filter.status.value = value || null
                  }}
                >
                  <option value="">All Groups</option>
                  <option value="active">Active Only</option>
                  <option value="deleted">Deleted Only</option>
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
                    filter.status.value = null
                  }}
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </Dropdown>

          <Link
            href={routes.groups.children!.create.href}
            class="btn btn-primary flex items-center gap-2"
          >
            <IconPlus class="size-5" />
            <span class="hidden md:inline">Create</span>
          </Link>
        </div>

        {filteredGroups.value.length === 0
          ? (
            <div class="text-center py-8 text-gray-500">
              {filter.search.value
                ? "No groups found matching your search."
                : "No groups created yet."}
            </div>
          )
          : (
            <Table
              headerSlot={
                <>
                  <th class="text-left">Name</th>
                  <th class="text-left">Currency</th>
                  <th class="text-left">Status</th>
                  <th class="text-right">Actions</th>
                </>
              }
              bodySlots={filteredGroups.value.map((grp) => (
                <>
                  <td class="text-gray-900 font-medium">
                    {grp.name}
                    {group.selectedId.value === grp.id && (
                      <span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td class="text-gray-600">{grp.defaultCurrency}</td>
                  <td class="text-gray-600">
                    {grp.deletedAt
                      ? (
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Deleted
                        </span>
                      )
                      : (
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      )}
                  </td>
                  <td class="text-right">
                    <Dropdown
                      button={<IconEllipsisVertical class="size-5" />}
                      buttonClass="btn-input-icon"
                    >
                      <div class="py-1" role="none">
                        {!grp.deletedAt && (
                          <>
                            <button
                              onClick={() => group.selectedId.value = grp.id}
                              type="button"
                              class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              disabled={group.selectedId.value === grp.id}
                            >
                              <IconPencilSquare class="size-4 mr-2" />
                              {group.selectedId.value === grp.id ? "Current Group" : "Select Group"}
                            </button>
                            <Link
                              href={routes.groups.children!.edit.href.replace(
                                ":id",
                                grp.id.toString(),
                              )}
                              class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <IconPencilSquare class="size-4 mr-2" />
                              Edit
                            </Link>
                            <button
                              onClick={() => handleDelete(grp)}
                              type="button"
                              class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                              disabled={group.ops.delete.value.inProgress}
                            >
                              <IconTrashBin class="size-4 mr-2" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </Dropdown>
                  </td>
                </>
              ))}
            />
          )}

        {group.list.value.length > 0 && (
          <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 class="text-sm font-medium text-blue-800 mb-2">About Groups</h3>
            <p class="text-sm text-blue-700">
              Groups are used to organize your financial data. All accounts, categories, and
              transactions belong to a group. You can collaborate with others by sharing groups, and
              switch between different groups for different purposes (e.g., personal, family,
              business).
            </p>
            <p class="text-sm text-blue-700 mt-2">
              <strong>Currently selected:</strong> {group.list.value.find((g) =>
                g.id === group.selectedId.value
              )?.name || "None"}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
