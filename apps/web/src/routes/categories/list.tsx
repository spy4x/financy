import { category } from "@web/state/category.ts"
import { IconLoading, IconPencilSquare, IconTrashBin } from "@client/icons"

export function CategoryList() {
  return (
    <ul class="divide-y divide-gray-200">
      {category.list.value.map((cat) => (
        <li key={cat.id} class="flex items-center justify-between py-2">
          <span>{cat.name}</span>
          <div class="flex items-center space-x-2">
            <button
              title="Edit Category"
              onClick={() =>
                category.update(cat.id, prompt("Edit name", cat.name) || cat.name)}
              disabled={category.ops.update.value.inProgress}
              class="btn btn-warning btn-icon mr-2"
              type="button"
            >
              {category.ops.update.value.inProgress ? <IconLoading /> : <IconPencilSquare />}
              <span class="sr-only">Edit Category</span>
            </button>
            <button
              title="Delete Category"
              onClick={() =>
                confirm(`Are you sure you want to remove category "${cat.name}"?`) &&
                category.remove(cat.id)}
              disabled={category.ops.delete.value.inProgress}
              class="btn btn-primary-outline btn-icon btn-error"
              type="button"
            >
              {category.ops.delete.value.inProgress ? <IconLoading /> : <IconTrashBin />}
              <span class="sr-only">Delete Category</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
