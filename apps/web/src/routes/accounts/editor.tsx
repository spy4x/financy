import { account } from "@web/state/account.ts"
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

export function AccountEditor() {
  const [match, params] = useRoute(routes.accounts.children!.edit.href)
  const editAccountId = match && params?.id ? parseInt(params.id) : null

  const name = useSignal("")
  const currency = useSignal("USD")
  const error = useSignal("")
  const state = useSignal<EditorState>(EditorState.INITIALIZING)

  // Helper function for cleaner state checks
  const isState = (checkState: EditorState) => state.value === checkState

  // Initialize for edit mode
  useSignalEffect(() => {
    if (isState(EditorState.INITIALIZING)) {
      if (editAccountId) {
        const existingAccount = account.list.value.find((a) => a.id === editAccountId)
        if (existingAccount) {
          name.value = existingAccount.name
          currency.value = existingAccount.currency
          error.value = ""
          state.value = EditorState.IDLE
        } else {
          error.value = "Account not found"
          state.value = EditorState.ERROR
        }
      } else {
        name.value = ""
        currency.value = "USD"
        error.value = ""
        state.value = EditorState.IDLE
      }
    }
  })

  // Handle operation state changes and redirect
  useSignalEffect(() => {
    // Handle errors
    if (account.ops.create.value.error) {
      error.value = account.ops.create.value.error
      state.value = EditorState.ERROR
    } else if (account.ops.update.value.error) {
      error.value = account.ops.update.value.error
      state.value = EditorState.ERROR
    }

    // Track operation progress and handle completion
    if (isState(EditorState.IN_PROGRESS)) {
      const isCreateInProgress = account.ops.create.value.inProgress
      const isUpdateInProgress = account.ops.update.value.inProgress

      if (!isCreateInProgress && !isUpdateInProgress) {
        // Operation completed successfully
        if (!account.ops.create.value.error && !account.ops.update.value.error) {
          state.value = EditorState.SUCCESS
          navigate(routes.accounts.href)
        }
      }
    }
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    const trimmedName = name.value.trim()
    if (!trimmedName) {
      error.value = "Account name is required"
      state.value = EditorState.ERROR
      return
    }

    if (!currency.value) {
      error.value = "Currency is required"
      state.value = EditorState.ERROR
      return
    }

    error.value = ""
    state.value = EditorState.IN_PROGRESS
    if (editAccountId) {
      account.update(editAccountId, trimmedName, currency.value)
    } else {
      account.create(trimmedName, currency.value)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle showGroupSelector>
        {editAccountId ? "Accounts - Edit" : "Accounts - Create"}
      </PageTitle>

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
                <label for="accountName" class="label">
                  Account Name:
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="accountName"
                    class="input"
                    placeholder="e.g., Checking Account, Savings, Cash"
                    value={name.value}
                    onBlur={(e) => name.value = e.currentTarget.value.trim()}
                    required
                  />
                </div>
              </div>

              <div class="sm:col-span-2">
                <label for="currency" class="label">
                  Currency:
                </label>
                <div class="mt-2">
                  <CurrencySelector
                    id="currency"
                    value={currency.value}
                    onChange={(currencyCode) => currency.value = currencyCode}
                    required
                    placeholder="Select account currency..."
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <Link href={routes.accounts.href} class="btn btn-link ml-auto">
              Cancel
            </Link>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!name.value.trim() || !currency.value}
            >
              {isState(EditorState.IN_PROGRESS) && <IconLoading />}
              {editAccountId ? "Update" : "Create"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
