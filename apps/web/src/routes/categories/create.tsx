import { category } from "@web/state/category.ts"
import { useSignal } from "@preact/signals"
import { IconLoading, IconPlus } from "@client/icons"

export function CategoryCreate() {
  const name = useSignal("")
  const creating = category.ops.create.value.inProgress

  function handleSubmit(e: Event) {
    e.preventDefault()
    const value = name.value.trim()
    if (value) {
      category.create(value)
      name.value = ""
    }
  }

  return (
    <form onSubmit={handleSubmit} class="mb-4 flex gap-2">
      <input
        class="input input-bordered flex-1"
        placeholder="New category"
        value={name.value}
        onInput={(e) => (name.value = (e.target as HTMLInputElement).value)}
        disabled={creating}
      />
      <button
        type="submit"
        class="btn btn-primary btn-icon"
        disabled={creating}
        title="Add Category"
      >
        {creating ? <IconLoading /> : <IconPlus />}
        <span class="sr-only">Add Category</span>
      </button>
    </form>
  )
}
