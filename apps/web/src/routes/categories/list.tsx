import { category } from "@web/state/category.ts"
import { useSignal } from "@preact/signals"
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

  const filteredCategories = category.list.value.filter((cat) =>
    cat.name.toLowerCase().includes(search.value.toLowerCase())
  )

  function handleDelete(cat: Category) {
    if (confirm(`Are you sure you want to delete the category "${cat.name}"?`)) {
      category.remove(cat.id)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle>Categories</PageTitle>
      <div>
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
            title="Create Category"
            href={routes.categories.children!.create.href}
            class="btn btn-primary flex items-center gap-2"
          >
            <IconPlus class="size-5" />
            <span class="hidden md:inline">Create</span>
          </Link>
        </div>

        {filteredCategories.length === 0
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
                  <th class="text-right">Actions</th>
                </>
              }
              bodySlots={filteredCategories.map((cat) => (
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
