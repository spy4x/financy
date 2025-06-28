import { category } from "@web/state/category.ts"
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
import { BudgetProgress } from "@web/components/ui/BudgetProgress.tsx"
import { Link } from "wouter-preact"
import { routes } from "../_router.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { CategoryType, CategoryTypeUtils, ItemStatus, ItemStatusUtils } from "@shared/types"
import type { Category } from "@shared/types"
import { shouldDropdownOpenUp } from "@shared/helpers/dropdown.ts"

export function CategoryList() {
  const filter = {
    search: useSignal(""),
    status: useSignal<ItemStatus>(ItemStatus.ACTIVE),
    type: useSignal<CategoryType | "all">("all"),
  }

  const filteredCategories = useComputed(() => {
    return category.list.value.filter((cat) => {
      // Filter by selected group first
      if (group.selectedId.value && cat.groupId !== group.selectedId.value) {
        return false
      }

      // Search filter
      if (!cat.name.toLowerCase().includes(filter.search.value.toLowerCase())) {
        return false
      }

      // Status filter
      if (!ItemStatusUtils.matches(cat, filter.status.value)) {
        return false
      }

      // Type filter
      if (filter.type.value !== "all" && cat.type !== filter.type.value) {
        return false
      }

      return true
    })
  })

  function handleDelete(cat: Category) {
    if (confirm(`Are you sure you want to delete the category "${cat.name}"?`)) {
      category.remove(cat.id)
    }
  }

  function handleUndelete(cat: Category) {
    if (confirm(`Are you sure you want to restore the category "${cat.name}"?`)) {
      category.undelete(cat.id)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle showGroupSelector>Categories</PageTitle>
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
                    placeholder="Search categories..."
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

              {/* Type Filter */}
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  class="input w-full"
                  value={filter.type.value}
                  onChange={(e) =>
                    filter.type.value = e.currentTarget.value as CategoryType | "all"}
                >
                  <option value="all">All Types</option>
                  <option value={CategoryType.EXPENSE}>Expense</option>
                  <option value={CategoryType.INCOME}>Income</option>
                </select>
              </div>

              {/* Clear Filters */}
              <div class="pt-2 border-t">
                <button
                  type="button"
                  class="btn btn-link text-sm w-full"
                  onClick={() => {
                    filter.search.value = ""
                    filter.status.value = ItemStatus.ACTIVE
                    filter.type.value = "all"
                  }}
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </Dropdown>

          <Link
            title={group.selectedId.value ? "Create Category" : "Please select a group first"}
            href={routes.categories.children!.create.href}
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

        {filteredCategories.value.length === 0
          ? (
            <div class="text-center py-8 text-gray-500">
              {!group.selectedId.value
                ? "Please select a group first to view categories."
                : filter.search.value
                ? "No categories found matching your search."
                : "No categories created yet."}
            </div>
          )
          : (
            <Table
              headerSlot={
                <>
                  <th class="text-left">Name</th>
                  <th class="text-left">Type</th>
                  <th class="text-left">Budget Progress</th>
                  <th class="text-right">Actions</th>
                </>
              }
              bodySlots={filteredCategories.value.map((cat, index) => {
                const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
                const currency = selectedGroup?.defaultCurrency || "USD"
                const monthlySpent = category.getMonthlySpent(cat.id)
                const monthlyLimit = cat.monthlyLimit || 0
                const isIncomeCategory = cat.type === CategoryType.INCOME

                return (
                  <>
                    <td class={`${cat.deletedAt ? "text-gray-400" : "text-gray-900"}`}>
                      <div class={`${cat.deletedAt ? "line-through" : ""}`}>
                        {cat.name}
                        {cat.deletedAt && <span class="ml-2 text-xs text-red-500">(Deleted)</span>}
                      </div>
                    </td>
                    <td class={`${cat.deletedAt ? "text-gray-400" : "text-gray-900"}`}>
                      <span
                        class={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          isIncomeCategory
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {CategoryTypeUtils.toString(cat.type || CategoryType.EXPENSE)}
                      </span>
                    </td>
                    <td class="min-w-0 w-80">
                      {isIncomeCategory
                        ? (
                          <span class="text-sm text-gray-500 italic">
                            Not applicable for income
                          </span>
                        )
                        : (
                          <BudgetProgress
                            spentAmount={monthlySpent}
                            limitAmount={monthlyLimit}
                            currency={currency}
                          />
                        )}
                    </td>
                    <td class="text-right">
                      <Dropdown
                        trigger={<IconEllipsisVertical class="size-5" />}
                        triggerClasses="btn-input-icon"
                        vertical={shouldDropdownOpenUp(index, filteredCategories.value.length)
                          ? "up"
                          : "down"}
                      >
                        <div class="py-1" role="none">
                          <Link
                            href={routes.categories.children!.edit.href.replace(
                              ":id",
                              cat.id.toString(),
                            )}
                            class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            <IconPencilSquare class="size-4 mr-2" />
                            Edit
                          </Link>
                          {cat.deletedAt
                            ? (
                              <button
                                onClick={() => handleUndelete(cat)}
                                type="button"
                                class="w-full flex items-center px-4 py-2 text-sm text-green-600 hover:bg-gray-100"
                                disabled={category.ops.update.value.inProgress}
                              >
                                <IconTrashBin class="size-4 mr-2" />
                                Restore
                              </button>
                            )
                            : (
                              <button
                                onClick={() => handleDelete(cat)}
                                type="button"
                                class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                disabled={category.ops.delete.value.inProgress}
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
      </div>
    </section>
  )
}
