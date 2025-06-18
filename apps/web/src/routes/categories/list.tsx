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
import type { Category } from "@shared/types"

export function CategoryList() {
  const search = useSignal("")

  const filteredCategories = useComputed(() => {
    return category.list.value.filter((cat) => {
      // Filter by selected group first
      if (group.selectedId.value && cat.groupId !== group.selectedId.value) {
        return false
      }

      // Then filter by search text
      return cat.name.toLowerCase().includes(search.value.toLowerCase())
    })
  })

  function handleDelete(cat: Category) {
    if (confirm(`Are you sure you want to delete the category "${cat.name}"?`)) {
      category.remove(cat.id)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle>Categories</PageTitle>
      <div>
        {group.selectedId.value && (
          <div class="mb-4 text-sm text-gray-600">
            Showing categories for group:{" "}
            <span class="font-medium text-gray-900">
              {group.list.value.find((g) => g.id === group.selectedId.value)?.name ||
                "Unknown Group"}
            </span>
          </div>
        )}

        <div class="flex items-center justify-between mb-6">
          <div class="relative w-60">
            <input
              class="input w-full pr-10"
              placeholder="Search"
              value={search.value}
              onInput={(e) => search.value = e.currentTarget.value}
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <IconSearch class="size-5 text-gray-600" />
            </span>
          </div>

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
                : search.value
                ? "No categories found matching your search."
                : "No categories created yet."}
            </div>
          )
          : (
            <Table
              headerSlot={
                <>
                  <th class="text-left">Name</th>
                  <th class="text-right">Actions</th>
                </>
              }
              bodySlots={filteredCategories.value.map((cat) => (
                <>
                  <td class="text-gray-900">{cat.name}</td>
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
              ))}
            />
          )}
      </div>
    </section>
  )
}
