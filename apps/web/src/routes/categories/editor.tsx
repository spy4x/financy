import { category } from "@web/state/category.ts"
import { useSignal, useSignalEffect } from "@preact/signals"
import { IconLoading } from "@client/icons"
import { Link, useRoute } from "wouter-preact"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { navigate } from "@client/helpers"
import { routes } from "../_router.tsx"

enum EditorState {
  INITIALIZING = "initializing",
  IDLE = "idle",
  IN_PROGRESS = "in_progress",
  SUCCESS = "success",
  ERROR = "error",
}

export function CategoryEditor() {
  const [match, params] = useRoute(routes.categories.children!.edit.href)
  const editCategoryId = match && params?.id ? parseInt(params.id) : null

  const name = useSignal("")
  const error = useSignal("")
  const state = useSignal<EditorState>(EditorState.INITIALIZING)

  // Helper function for cleaner state checks
  const isState = (checkState: EditorState) => state.value === checkState

  // Initialize for edit mode
  useSignalEffect(() => {
    if (isState(EditorState.INITIALIZING)) {
      if (editCategoryId) {
        const existingCategory = category.list.value.find((c) => c.id === editCategoryId)
        if (existingCategory) {
          name.value = existingCategory.name
          error.value = ""
          state.value = EditorState.IDLE
        } else {
          error.value = "Category not found"
          state.value = EditorState.ERROR
        }
      } else {
        name.value = ""
        error.value = ""
        state.value = EditorState.IDLE
      }
    }
  })

  // Handle operation state changes and redirect
  useSignalEffect(() => {
    // Handle errors
    if (category.ops.create.value.error) {
      error.value = category.ops.create.value.error
      state.value = EditorState.ERROR
    } else if (category.ops.update.value.error) {
      error.value = category.ops.update.value.error
      state.value = EditorState.ERROR
    }

    // Track operation progress and handle completion
    if (isState(EditorState.IN_PROGRESS)) {
      const isCreateInProgress = category.ops.create.value.inProgress
      const isUpdateInProgress = category.ops.update.value.inProgress

      if (!isCreateInProgress && !isUpdateInProgress) {
        // Operation completed successfully
        if (!category.ops.create.value.error && !category.ops.update.value.error) {
          state.value = EditorState.SUCCESS
          navigate(routes.categories.href)
        }
      }
    }
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    const trimmedName = name.value.trim()
    if (!trimmedName) {
      error.value = "Category name is required"
      state.value = EditorState.ERROR
      return
    }

    error.value = ""
    state.value = EditorState.IN_PROGRESS
    if (editCategoryId) {
      category.update(editCategoryId, trimmedName)
    } else {
      category.create(trimmedName)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle>{editCategoryId ? "Categories - Edit" : "Categories - Create"}</PageTitle>

      {error.value && (
        <div class="mb-4 p-4 text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error.value}
        </div>
      )}

      <form onSubmit={handleSubmit} class="card">
        <fieldset disabled={isState(EditorState.IN_PROGRESS)}>
          <div class="card-body">
            <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div class="sm:col-span-4">
                <label for="categoryName" class="label">
                  Name:
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="categoryName"
                    class="input"
                    placeholder="Enter name"
                    value={name.value}
                    onBlur={(e) => name.value = e.currentTarget.value.trim()}
                    required
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <Link href={routes.categories.href} class="btn btn-link ml-auto">
              Cancel
            </Link>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!name.value.trim()}
            >
              {isState(EditorState.IN_PROGRESS) && <IconLoading />}
              {editCategoryId ? "Update" : "Create"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
