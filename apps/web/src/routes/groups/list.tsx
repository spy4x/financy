import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { useComputed, useSignal } from "@preact/signals"
import { useUrlFilters } from "@client/preact/use-url-filters.ts"
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
import { type Group, ItemStatus, ItemStatusUtils } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"

export function GroupList() {
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
      parser: (value) => {
        const num = value ? parseInt(value, 10) : null
        return !isNaN(num!) ? num : null
      },
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

  const { search, currencyId: currencyFilter, status } = filters

  const filteredGroups = useComputed(() => {
    return group.list.value.filter((grp) => {
      // Search filter
      if (!grp.name.toLowerCase().includes(search.value.toLowerCase())) {
        return false
      }

      // Currency filter
      if (currencyFilter.value && grp.currencyId !== currencyFilter.value) {
        return false
      }

      // Status filter using ItemStatusUtils
      if (!ItemStatusUtils.matches(grp, status.value)) {
        return false
      }

      return true
    })
  })

  // Count active (non-deleted) groups for deletion prevention
  const activeGroups = useComputed(() => {
    return group.list.value.filter((g) => !g.deletedAt)
  })

  function handleDelete(grp: Group) {
    // Check if this is the last active group
    if (activeGroups.value.length <= 1) {
      alert("Cannot delete the last group. At least one group must exist at all times.")
      return
    }

    if (
      confirm(
        `Are you sure you want to delete the group "${grp.name}"? This will delete all associated accounts, categories, and transactions.`,
      )
    ) {
      group.remove(grp.id)
    }
  }

  function handleUndelete(grp: Group) {
    group.undelete(grp.id)
  }

  return (
    <section class="page-layout">
      <PageTitle>Groups</PageTitle>
      <div>
        <div class="flex items-center justify-between mb-6">
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
                    placeholder="Search groups..."
                    value={search.value}
                    onInput={(e) => search.value = e.currentTarget.value}
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
                  value={currencyFilter.value || ""}
                  onChange={(id) => currencyFilter.value = id || null}
                  placeholder="All Currencies"
                />
              </div>

              {/* Status Filter */}
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
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

              {/* Clear Filters */}
              <div class="pt-2 border-t">
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
              {search.value ? "No groups found matching your search." : "No groups created yet."}
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
              bodySlots={filteredGroups.value.map((grp, index) => {
                const isDeleted = !!grp.deletedAt

                return (
                  <>
                    <td class={`font-medium ${isDeleted ? "text-gray-400" : "text-gray-900"}`}>
                      <Link
                        href={routes.groups.children!.edit.href.replace(
                          ":id",
                          grp.id.toString(),
                        )}
                        class={`hover:underline cursor-pointer ${
                          isDeleted
                            ? "line-through text-gray-400"
                            : "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        }`}
                        data-e2e="group-name-link"
                      >
                        {grp.name}
                        {isDeleted && <span class="ml-2 text-xs">(Deleted)</span>}
                      </Link>
                      {group.selectedId.value === grp.id && (
                        <span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td class={`${isDeleted ? "text-gray-400 line-through" : "text-gray-600"}`}>
                      {currency.getById(grp.currencyId).code}
                    </td>
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
                        trigger={<IconEllipsisVertical class="size-5" />}
                        triggerClasses="btn-input-icon"
                        vertical={shouldDropdownOpenUp(index, filteredGroups.value.length)
                          ? "up"
                          : "down"}
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
                                {group.selectedId.value === grp.id
                                  ? "Current Group"
                                  : "Select Group"}
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
                                class={`w-full flex items-center px-4 py-2 text-sm ${
                                  activeGroups.value.length <= 1 ||
                                    group.ops.delete.value.inProgress
                                    ? "text-gray-400 cursor-not-allowed"
                                    : "text-red-600 hover:bg-gray-100"
                                }`}
                                disabled={activeGroups.value.length <= 1 ||
                                  group.ops.delete.value.inProgress}
                                title={activeGroups.value.length <= 1
                                  ? "Cannot delete the last group. At least one group must exist at all times."
                                  : "Delete group"}
                              >
                                <IconTrashBin class="size-4 mr-2" />
                                Delete
                              </button>
                            </>
                          )}
                          {grp.deletedAt && (
                            <button
                              onClick={() => handleUndelete(grp)}
                              type="button"
                              class="w-full flex items-center px-4 py-2 text-sm text-green-600 hover:bg-gray-100"
                              disabled={group.ops.update.value.inProgress}
                            >
                              <IconTrashBin class="size-4 mr-2" />
                              Restore
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
