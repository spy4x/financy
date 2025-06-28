import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { ws } from "@web/state/ws.ts"
import { useSignal, useSignalEffect } from "@preact/signals"
import { IconLoading } from "@client/icons"
import { Link, useRoute } from "wouter-preact"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { CurrencySelector } from "@web/components/ui/CurrencySelector.tsx"
import { navigate } from "@client/helpers"
import { routes } from "../_router.tsx"

enum EditorState {
  INITIALIZING = "initializing",
  IDLE = "idle",
  IN_PROGRESS = "in_progress",
  SUCCESS = "success",
  ERROR = "error",
}

export function GroupEditor() {
  const [match, params] = useRoute(routes.groups.children!.edit.href)
  const editGroupId = match && params?.id ? parseInt(params.id) : null

  const name = useSignal("")
  const currencyId = useSignal<number | null>(null)
  const error = useSignal("")
  const state = useSignal<EditorState>(EditorState.INITIALIZING)

  // Helper function for cleaner state checks
  const isState = (checkState: EditorState) => state.value === checkState

  // Initialize for edit mode
  useSignalEffect(() => {
    if (isState(EditorState.INITIALIZING)) {
      if (editGroupId) {
        // If sync is in progress, wait for it to complete before checking for group
        if (ws.syncOp.value.inProgress) {
          return
        }

        const existingGroup = group.list.value.find((g) => g.id === editGroupId)
        if (existingGroup) {
          name.value = existingGroup.name
          currencyId.value = existingGroup.currencyId
          error.value = ""
          state.value = EditorState.IDLE
        } else {
          error.value = "Group not found"
          state.value = EditorState.ERROR
        }
      } else {
        name.value = ""
        // Default to USD currency ID (1) if available, otherwise null
        const usdCurrency = currency.findByCode("USD")
        currencyId.value = usdCurrency?.id || null
        error.value = ""
        state.value = EditorState.IDLE
      }
    }
  })

  // Retry initialization when sync completes (for page refreshes)
  useSignalEffect(() => {
    // If we're in error state and sync just completed, retry initialization
    if (isState(EditorState.ERROR) && !ws.syncOp.value.inProgress && editGroupId) {
      state.value = EditorState.INITIALIZING
    }
  })

  // Handle operation state changes and redirect
  useSignalEffect(() => {
    // Handle errors
    if (group.ops.create.value.error) {
      error.value = group.ops.create.value.error
      state.value = EditorState.ERROR
    } else if (group.ops.update.value.error) {
      error.value = group.ops.update.value.error
      state.value = EditorState.ERROR
    }

    // Track operation progress and handle completion
    if (isState(EditorState.IN_PROGRESS)) {
      const isCreateInProgress = group.ops.create.value.inProgress
      const isUpdateInProgress = group.ops.update.value.inProgress

      if (!isCreateInProgress && !isUpdateInProgress) {
        // Operation completed successfully
        if (!group.ops.create.value.error && !group.ops.update.value.error) {
          state.value = EditorState.SUCCESS
          navigate(routes.groups.href)
        }
      }
    }
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    const trimmedName = name.value.trim()
    if (!trimmedName) {
      error.value = "Group name is required"
      state.value = EditorState.ERROR
      return
    }

    if (!currencyId.value) {
      error.value = "Currency is required"
      state.value = EditorState.ERROR
      return
    }

    error.value = ""
    state.value = EditorState.IN_PROGRESS
    if (editGroupId) {
      group.update(editGroupId, trimmedName, currencyId.value)
    } else {
      group.create(trimmedName, currencyId.value)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle>{editGroupId ? "Groups - Edit" : "Groups - Create"}</PageTitle>

      {error.value && (
        <div class="mb-4 p-4 text-red-700 dark:text-red-200 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md">
          {error.value}
        </div>
      )}

      <form onSubmit={handleSubmit} class="card">
        <fieldset disabled={isState(EditorState.IN_PROGRESS)}>
          <div class="card-body">
            <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div class="sm:col-span-4">
                <label for="groupName" class="label">
                  Group Name:
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="groupName"
                    class="input"
                    placeholder="e.g., Personal, Family, Business"
                    value={name.value}
                    onInput={(e) => name.value = e.currentTarget.value}
                    onBlur={(e) => name.value = e.currentTarget.value.trim()}
                    required
                  />
                </div>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Choose a descriptive name for your financial group.
                </p>
              </div>

              <div class="sm:col-span-3">
                <label for="currency" class="label">
                  Currency:
                </label>
                <div class="mt-2">
                  <CurrencySelector
                    id="currency"
                    value={currencyId.value}
                    onChange={(id) => currencyId.value = id}
                    required
                    placeholder="Select currency..."
                  />
                </div>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  This will be the default currency for new accounts in this group.
                </p>
              </div>
            </div>

            {!editGroupId && (
              <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-md">
                <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                  What are Groups?
                </h3>
                <p class="text-sm text-blue-700 dark:text-blue-300">
                  Groups help you organize your finances by context. For example:
                </p>
                <ul class="text-sm text-blue-700 dark:text-blue-300 mt-2 list-disc list-inside">
                  <li>
                    <strong>Personal:</strong> Your individual accounts and expenses
                  </li>
                  <li>
                    <strong>Family:</strong> Shared household budget and expenses
                  </li>
                  <li>
                    <strong>Business:</strong> Company accounts and business expenses
                  </li>
                </ul>
                <p class="text-sm text-blue-700 dark:text-blue-300 mt-2">
                  You can switch between groups and even collaborate with others by sharing access
                  to groups.
                </p>
              </div>
            )}
          </div>
          <div class="card-footer">
            <Link href={routes.groups.href} class="btn btn-link ml-auto">
              Cancel
            </Link>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!name.value.trim() || !currencyId.value}
            >
              {isState(EditorState.IN_PROGRESS) && <IconLoading />}
              {editGroupId ? "Update" : "Create"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
