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
import type { Category } from "@shared/types"

export function CategoryList() {
  const filter = {
    search: useSignal(""),
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

      return true
    })
  })

  function handleDelete(cat: Category) {
    if (confirm(`Are you sure you want to delete the category "${cat.name}"?`)) {
      category.remove(cat.id)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle showGroupSelector>Categories</PageTitle>
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
                    placeholder="Search categories..."
                    value={filter.search.value}
                    onInput={(e) => filter.search.value = e.currentTarget.value}
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <IconSearch class="size-5 text-gray-600" />
                  </span>
                </div>
              </div>

              {/* Clear Filters */}
              <div class="pt-2 border-t">
                <button
                  type="button"
                  class="btn btn-link text-sm w-full"
                  onClick={() => {
                    filter.search.value = ""
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
                  <th class="text-left">Budget Progress</th>
                  <th class="text-right">Actions</th>
                </>
              }
              bodySlots={filteredCategories.value.map((cat) => {
                const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
                const currency = selectedGroup?.defaultCurrency || "USD"
                const monthlySpent = category.getMonthlySpent(cat.id)
                const monthlyLimit = cat.monthlyLimit || 0

                return (
                  <>
                    <td class="text-gray-900">{cat.name}</td>
                    <td class="min-w-0 w-80">
                      <BudgetProgress
                        spentAmount={monthlySpent}
                        limitAmount={monthlyLimit}
                        currency={currency}
                      />
                    </td>
                    <td class="text-right">
                      <Dropdown
                        button={<IconEllipsisVertical class="size-5" />}
                        buttonClass="btn-input-icon"
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
                          <button
                            onClick={() => handleDelete(cat)}
                            type="button"
                            class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                            disabled={category.ops.delete.value.inProgress}
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
      </div>
    </section>
  )
}
