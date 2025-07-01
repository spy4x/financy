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
import { useUrlFilters } from "@client/preact/use-url-filters.ts"

export function CategoryList() {
  // URL-synced filters using the custom hook
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
        value && Object.values(ItemStatus).includes(value as ItemStatus)
          ? value as ItemStatus
          : ItemStatus.ACTIVE,
    },
    type: {
      signal: useSignal<CategoryType | "all">("all"),
      initialValue: "all",
      urlParam: "type",
      parser: (value) => {
        if (value === "all") return "all"
        const typeNum = value ? parseInt(value, 10) : null
        return typeNum && Object.values(CategoryType).includes(typeNum as CategoryType)
          ? typeNum as CategoryType
          : "all"
      },
    },
  })

  const { search, status, type } = filters

  const filteredCategories = useComputed(() => {
    return category.list.value.filter((cat) => {
      // Filter by selected group
      if (cat.groupId !== group.selectedId.value) {
        return false
      }

      // Search filter
      if (!cat.name.toLowerCase().includes(search.value.toLowerCase())) {
        return false
      }

      // Status filter
      if (!ItemStatusUtils.matches(cat, status.value)) {
        return false
      }

      // Type filter
      if (type.value !== "all" && cat.type !== type.value) {
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
      <PageTitle>Categories</PageTitle>
      <div>
        <div class="space-y-4">
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
                  <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
                  <div class="relative">
                    <input
                      class="input w-full pr-10"
                      placeholder="Search categories..."
                      value={search.value}
                      onInput={(e) => {
                        search.value = e.currentTarget.value
                      }}
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

                {/* Type Filter */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    key={type.value}
                    class="input w-full"
                    value={type.value}
                    onInput={(e) => {
                      type.value = e.currentTarget.value as CategoryType | "all"
                    }}
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
                    onClick={clearFilters}
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            </Dropdown>

            <Link
              href={routes.categories.children!.create.href}
              class="btn btn-primary flex items-center gap-2"
            >
              <IconPlus class="size-5" />
              <span class="hidden md:inline">Create</span>
            </Link>
          </div>

          {filteredCategories.value.length === 0
            ? (
              <div class="text-center py-8 text-gray-500">
                {search.value
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
                  const currency = group.getSelectedCurrency().code
                  const monthlySpent = category.getMonthlySpent(cat.id)
                  const monthlyLimit = cat.monthlyLimit || 0
                  const isIncomeCategory = cat.type === CategoryType.INCOME

                  return (
                    <>
                      <td class={`${cat.deletedAt ? "text-gray-400" : "text-gray-900"}`}>
                        <div
                          class={`flex items-center gap-2 ${cat.deletedAt ? "line-through" : ""}`}
                        >
                          {cat.icon && (
                            <span class="text-lg" title={cat.name}>
                              {cat.icon}
                            </span>
                          )}
                          <div class="flex items-center gap-2">
                            {cat.color && (
                              <div
                                class="w-3 h-3 rounded-full border border-gray-300"
                                style={{ backgroundColor: cat.color }}
                                title={`Color: ${cat.color}`}
                              />
                            )}
                            <span>{cat.name}</span>
                          </div>
                          {cat.deletedAt && (
                            <span class="ml-2 text-xs text-red-500">(Deleted)</span>
                          )}
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
                            {!cat.deletedAt && (
                              <Link
                                href={`${routes.transactions.href}?categoryId=${cat.id}`}
                                class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                title="Find transactions for this category"
                              >
                                <IconSearch class="size-4 mr-2" />
                                Find Transactions
                              </Link>
                            )}
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
      </div>
    </section>
  )
}
