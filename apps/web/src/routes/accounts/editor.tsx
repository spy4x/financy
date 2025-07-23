import { account } from "@web/state/account.ts"
import { currency } from "@web/state/currency.ts"
import { transaction } from "@web/state/transaction.ts"
import { ws } from "@web/state/ws.ts"
import { useComputed, useSignal, useSignalEffect } from "@preact/signals"
import { IconAlertTriangle, IconLoading } from "@client/icons"
import { Link, useRoute } from "wouter-preact"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { CurrencySelector } from "@web/components/ui/CurrencySelector.tsx"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { navigate } from "@client/helpers"
import { routes } from "../_router.tsx"
import { formatCentsToInput, parseCurrencyInput } from "@shared/helpers/format.ts"

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
  const currencyId = useSignal<number | null>(null)
  const originalCurrencyId = useSignal<number | null>(null) // Track original currency for change warnings
  const startingBalance = useSignal("")
  const error = useSignal("")
  const state = useSignal<EditorState>(EditorState.INITIALIZING)

  // Helper function for cleaner state checks
  const isState = (checkState: EditorState) => state.value === checkState

  // Check if currency is being changed and account has transactions
  const currencyChangeWarning = useComputed(() => {
    if (!editAccountId || !originalCurrencyId.value || !currencyId.value) {
      return null
    }

    if (originalCurrencyId.value === currencyId.value) {
      return null // No change
    }

    // Check if account has any transactions
    const accountTransactions = transaction.list.value.filter((t) => t.accountId === editAccountId)
    if (accountTransactions.length === 0) {
      return null // No transactions, safe to change
    }

    const oldCurrency = currency.getById(originalCurrencyId.value)
    const newCurrency = currency.getById(currencyId.value)

    return {
      transactionCount: accountTransactions.length,
      oldCurrency: oldCurrency?.code || "Unknown",
      newCurrency: newCurrency?.code || "Unknown",
    }
  })

  // Get currency for formatting the starting balance
  const selectedCurrency = useComputed(() =>
    currencyId.value ? currency.getById(currencyId.value) : null
  )

  // Initialize for edit mode
  useSignalEffect(() => {
    if (isState(EditorState.INITIALIZING)) {
      if (editAccountId) {
        // If sync is in progress, wait for it to complete before checking for account
        if (ws.syncOp.value.inProgress) {
          return
        }

        const existingAccount = account.list.value.find((a) => a.id === editAccountId)
        if (existingAccount) {
          name.value = existingAccount.name
          currencyId.value = existingAccount.currencyId
          originalCurrencyId.value = existingAccount.currencyId // Store original currency
          startingBalance.value = formatCentsToInput(existingAccount.startingBalance)
          error.value = ""
          state.value = EditorState.IDLE
        } else {
          error.value = "Account not found"
          state.value = EditorState.ERROR
        }
      } else {
        name.value = ""
        // Default to USD currency ID if available, otherwise null
        const usdCurrency = currency.getByCode("USD")
        currencyId.value = usdCurrency?.id || null
        originalCurrencyId.value = null // No original currency for new accounts
        startingBalance.value = "0"
        error.value = ""
        state.value = EditorState.IDLE
      }
    }
  })

  // Retry initialization when sync completes (for page refreshes)
  useSignalEffect(() => {
    // If we're in error state and sync just completed, retry initialization
    if (isState(EditorState.ERROR) && !ws.syncOp.value.inProgress && editAccountId) {
      state.value = EditorState.INITIALIZING
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

    if (!currencyId.value) {
      error.value = "Currency is required"
      state.value = EditorState.ERROR
      return
    }

    // Parse starting balance
    const startingBalanceCents = parseCurrencyInput(startingBalance.value.trim())
    if (startingBalanceCents === null) {
      error.value = "Starting balance must be a valid number"
      state.value = EditorState.ERROR
      return
    }

    error.value = ""
    state.value = EditorState.IN_PROGRESS
    if (editAccountId) {
      account.update(editAccountId, trimmedName, currencyId.value, startingBalanceCents)
    } else {
      account.create(trimmedName, currencyId.value, startingBalanceCents)
    }
  }

  return (
    <section class="page-layout">
      <PageTitle>
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
                    value={currencyId.value}
                    onChange={(id) => currencyId.value = id}
                    required
                    placeholder="Select account currency..."
                  />
                </div>

                {/* Currency Change Warning */}
                {currencyChangeWarning.value && (
                  <div class="mt-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                    <div class="flex items-start gap-3">
                      <IconAlertTriangle class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <div class="text-sm">
                        <h4 class="font-medium text-amber-800 dark:text-amber-200 mb-1">
                          Currency Change Warning
                        </h4>
                        <p class="text-amber-700 dark:text-amber-300 mb-2">
                          This account has {currencyChangeWarning.value.transactionCount}{" "}
                          existing transaction{currencyChangeWarning.value.transactionCount === 1
                            ? ""
                            : "s"}
                          in {currencyChangeWarning.value.oldCurrency}. Changing to{" "}
                          {currencyChangeWarning.value.newCurrency} will:
                        </p>
                        <ul class="text-amber-700 dark:text-amber-300 text-xs space-y-1 ml-4 list-disc">
                          <li>Keep existing transactions in their original currency</li>
                          <li>
                            Use {currencyChangeWarning.value.newCurrency} for new transactions
                          </li>
                          <li>Require currency conversion for accurate balance calculations</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div class="sm:col-span-2">
                <label for="startingBalance" class="label">
                  Starting Balance{selectedCurrency.value
                    ? ` (${selectedCurrency.value.code})`
                    : ""}:
                </label>
                <div class="mt-2">
                  <div class="relative">
                    {selectedCurrency.value?.symbol && (
                      <div class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none">
                        {selectedCurrency.value.symbol}
                      </div>
                    )}
                    <input
                      type="text"
                      id="startingBalance"
                      class={`input ${selectedCurrency.value?.symbol ? "pl-8" : ""}`}
                      placeholder={selectedCurrency.value
                        ? `0.${"0".repeat(selectedCurrency.value.decimalPlaces || 2)}`
                        : "0.00"}
                      value={startingBalance.value}
                      onInput={(e) => startingBalance.value = e.currentTarget.value}
                      onBlur={(e) => {
                        // Format the input on blur for better UX
                        const parsed = parseCurrencyInput(e.currentTarget.value)
                        if (parsed !== null) {
                          startingBalance.value = formatCentsToInput(parsed)
                        }
                      }}
                    />
                    {selectedCurrency.value && startingBalance.value &&
                      parseCurrencyInput(startingBalance.value) !== null && (
                      <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
                        <CurrencyDisplay
                          amount={parseCurrencyInput(startingBalance.value) || 0}
                          currency={selectedCurrency.value.id}
                        />
                      </div>
                    )}
                  </div>
                  <div class="mt-2 p-3 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                    <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">
                      How Starting Balance Works:
                    </p>
                    <p class="mb-2">
                      Your <strong>starting balance</strong>{" "}
                      represents how much money was in this account when you first started using
                      this app. This helps you track your financial progress from a specific point
                      in time.
                    </p>
                    <p class="mb-2">
                      <strong>Current Balance = Starting Balance + All Transactions</strong>
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-500">
                      Example: If you set starting balance to $1,000 and add a $50 expense
                      transaction, your current balance will show $950 ($1,000 - $50).
                    </p>
                  </div>
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
              disabled={!name.value.trim() || !currencyId.value ||
                parseCurrencyInput(startingBalance.value.trim()) === null}
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
