import { transaction } from "@web/state/transaction.ts"
import { account } from "@web/state/account.ts"
import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { ws } from "@web/state/ws.ts"
import { useComputed, useSignal, useSignalEffect } from "@preact/signals"
import { IconLoading } from "@client/icons"
import { Link, useRoute } from "wouter-preact"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { CurrencySelector } from "@web/components/ui/CurrencySelector.tsx"
import { navigate } from "@client/helpers"
import { routes } from "../_router.tsx"
import { CategoryType, TransactionType, TransactionTypeUtils } from "@shared/types"
import {
  applyCurrencySign,
  formatCentsToInput,
  parseCurrencyInput,
} from "@shared/helpers/format.ts"

enum EditorState {
  INITIALIZING = "initializing",
  IDLE = "idle",
  IN_PROGRESS = "in_progress",
  SUCCESS = "success",
  ERROR = "error",
}

export function TransactionEditor() {
  const [match, params] = useRoute(routes.transactions.children!.edit.href)
  const editTransactionId = match && params?.id ? parseInt(params.id) : null

  const accountId = useSignal<number | null>(null)
  const toAccountId = useSignal<number | null>(null) // Only used for transfers
  const categoryId = useSignal<number | null>(null)
  const type = useSignal<number>(1) // Default to Debit
  const amount = useSignal("")
  const memo = useSignal("")
  const originalCurrencyId = useSignal<number | null>(null)
  const originalAmount = useSignal("")
  const timestamp = useSignal("")
  const error = useSignal("")
  const state = useSignal<EditorState>(EditorState.INITIALIZING)

  // Track if we're editing a transfer where the UI has been "swapped" for better UX
  // This happens when editing the credit (positive amount) side of a transfer
  const isTransferSwapped = useSignal<boolean>(false)

  // Helper function for cleaner state checks
  const isState = (checkState: EditorState) => state.value === checkState

  // Get accounts and categories for current group, sorted with active items first
  const groupAccounts = useComputed(() => {
    const selectedGroupId = group.selectedId.value
    if (!selectedGroupId) return []

    return account.list.value
      .filter((acc) => acc.groupId === selectedGroupId)
      .sort((a, b) => {
        // Active items first, then deleted items
        const aIsDeleted = !!a.deletedAt
        const bIsDeleted = !!b.deletedAt

        if (aIsDeleted !== bIsDeleted) {
          return aIsDeleted ? 1 : -1
        }

        // Within same status, sort by name
        return a.name.localeCompare(b.name)
      })
  })

  const groupCategories = useComputed(() => {
    const selectedGroupId = group.selectedId.value
    if (!selectedGroupId) return []

    const currentTransactionType = type.value
    const expectedCategoryType = currentTransactionType === TransactionType.CREDIT
      ? CategoryType.INCOME
      : CategoryType.EXPENSE

    return category.list.value
      .filter((cat) => {
        // Filter by group
        if (cat.groupId !== selectedGroupId) return false

        // Filter by appropriate category type for transaction type
        const catType = cat.type || CategoryType.EXPENSE // Default to expense for backward compatibility
        return catType === expectedCategoryType
      })
      .sort((a, b) => {
        // Active items first, then deleted items
        const aIsDeleted = !!a.deletedAt
        const bIsDeleted = !!b.deletedAt

        if (aIsDeleted !== bIsDeleted) {
          return aIsDeleted ? 1 : -1
        }

        // Within same status, sort by name
        return a.name.localeCompare(b.name)
      })
  })

  // Initialize for edit mode or URL parameters
  useSignalEffect(() => {
    if (isState(EditorState.INITIALIZING)) {
      // Check URL parameters for pre-filling form (for create mode)
      const urlParams = new URLSearchParams(globalThis.location.search)
      const urlType = urlParams.get("type")
      const urlFromAccountId = urlParams.get("fromAccountId")

      if (editTransactionId) {
        // If sync is in progress, wait for it to complete before checking for transaction
        if (ws.syncOp.value.inProgress) {
          return
        }

        const existingTransaction = transaction.list.value.find((t) => t.id === editTransactionId)
        if (existingTransaction) {
          accountId.value = existingTransaction.accountId
          categoryId.value = existingTransaction.categoryId || null
          type.value = existingTransaction.type

          // For transfers, find the linked transaction to get the destination account
          if (
            existingTransaction.type === TransactionType.TRANSFER &&
            existingTransaction.linkedTransactionCode
          ) {
            const linkedTransaction = transaction.list.value.find((t) =>
              t.linkedTransactionCode === existingTransaction.linkedTransactionCode &&
              t.id !== existingTransaction.id
            )
            if (linkedTransaction) {
              // Determine which transaction is the debit (from) and which is the credit (to)
              // The transaction with negative amount is the debit (from), positive is credit (to)
              if (existingTransaction.amount < 0) {
                // Current transaction is the debit (from account)
                accountId.value = existingTransaction.accountId
                toAccountId.value = linkedTransaction.accountId
                isTransferSwapped.value = false
              } else {
                // Current transaction is the credit (to account), linked is debit (from account)
                // For UX, we swap the accounts to show the transfer direction logically
                accountId.value = linkedTransaction.accountId
                toAccountId.value = existingTransaction.accountId
                isTransferSwapped.value = true // Mark that we've swapped for correct submission
              }
            } else {
              toAccountId.value = null
              isTransferSwapped.value = false
            }
          } else {
            toAccountId.value = null
            isTransferSwapped.value = false
          }

          // Always show positive amount in form - sign is determined by type
          amount.value = formatCentsToInput(Math.abs(existingTransaction.amount))
          memo.value = existingTransaction.memo || ""
          originalCurrencyId.value = existingTransaction.originalCurrencyId || null
          originalAmount.value = existingTransaction.originalAmount
            ? formatCentsToInput(Math.abs(existingTransaction.originalAmount))
            : ""
          // Format timestamp as datetime-local input value (YYYY-MM-DDTHH:mm)
          timestamp.value = new Date(existingTransaction.timestamp).toISOString().slice(0, 16)
          error.value = ""
          state.value = EditorState.IDLE
        } else {
          error.value = "Transaction not found"
          state.value = EditorState.ERROR
        }
      } else {
        // Create mode - set defaults and handle URL parameters
        const accounts = groupAccounts.value
        const categories = groupCategories.value

        // Set type from URL parameter if provided
        if (urlType && ["1", "2", "3"].includes(urlType)) {
          type.value = parseInt(urlType)
        } else {
          type.value = 1 // Default to Debit
        }

        // Set from account from URL parameter if provided
        if (urlFromAccountId) {
          const fromAccountIdNum = parseInt(urlFromAccountId)
          const fromAccount = accounts.find((acc) => acc.id === fromAccountIdNum)
          if (fromAccount) {
            accountId.value = fromAccountIdNum
          } else {
            accountId.value = accounts.length > 0 ? accounts[0].id : null
          }
        } else {
          accountId.value = accounts.length > 0 ? accounts[0].id : null
        }

        toAccountId.value = accounts.length > 1 ? accounts[1].id : null
        categoryId.value = categories.length > 0 ? categories[0].id : null
        amount.value = ""
        memo.value = ""
        originalCurrencyId.value = null
        originalAmount.value = ""
        // Default to current date and time
        timestamp.value = new Date().toISOString().slice(0, 16)
        error.value = ""
        state.value = EditorState.IDLE
      }
    }
  })

  // Retry initialization when sync completes (for page refreshes)
  useSignalEffect(() => {
    // If we're in error state and sync just completed, retry initialization
    if (isState(EditorState.ERROR) && !ws.syncOp.value.inProgress && editTransactionId) {
      state.value = EditorState.INITIALIZING
    }
  })

  // Handle operation state changes and redirect
  useSignalEffect(() => {
    // Handle errors
    if (transaction.ops.create.value.error) {
      error.value = transaction.ops.create.value.error
      state.value = EditorState.ERROR
    } else if (transaction.ops.update.value.error) {
      error.value = transaction.ops.update.value.error
      state.value = EditorState.ERROR
    }

    // Track operation progress and handle completion
    if (isState(EditorState.IN_PROGRESS)) {
      const isCreateInProgress = transaction.ops.create.value.inProgress
      const isUpdateInProgress = transaction.ops.update.value.inProgress

      if (!isCreateInProgress && !isUpdateInProgress) {
        // Operation completed successfully
        if (!transaction.ops.create.value.error && !transaction.ops.update.value.error) {
          state.value = EditorState.SUCCESS
          navigate(routes.transactions.href)
        }
      }
    }
  })

  function handleSubmit(e: Event) {
    e.preventDefault()

    // Validation
    if (!accountId.value) {
      error.value = "Account is required"
      state.value = EditorState.ERROR
      return
    }

    // For transfers, use simpler validation - just check if toAccountId is set
    const transactionData = {
      type: type.value,
      accountId: accountId.value,
      categoryId: categoryId.value,
    }

    // Simpler validation - transfers don't use the complex field validation
    if (type.value === TransactionType.TRANSFER) {
      if (!toAccountId.value) {
        error.value = "Destination account is required for transfers"
        state.value = EditorState.ERROR
        return
      }
      if (accountId.value === toAccountId.value) {
        error.value = "Source and destination accounts must be different"
        state.value = EditorState.ERROR
        return
      }
    } else {
      const validationError = TransactionTypeUtils.validateFields(transactionData)
      if (validationError) {
        error.value = validationError
        state.value = EditorState.ERROR
        return
      }
    }

    const trimmedAmount = amount.value.trim()
    if (!trimmedAmount) {
      error.value = "Amount is required"
      state.value = EditorState.ERROR
      return
    }

    const amountInCents = parseCurrencyInput(trimmedAmount)
    if (amountInCents === null || amountInCents <= 0) {
      error.value = "Amount must be a positive number"
      state.value = EditorState.ERROR
      return
    }

    // Validate original amount if provided
    let originalAmountInCents: number | undefined
    if (originalAmount.value.trim()) {
      const parsedOriginal = parseCurrencyInput(originalAmount.value.trim())
      if (parsedOriginal === null || parsedOriginal <= 0) {
        error.value = "Original amount must be a positive number"
        state.value = EditorState.ERROR
        return
      }
      originalAmountInCents = parsedOriginal
    }

    error.value = ""
    state.value = EditorState.IN_PROGRESS

    // Apply correct sign based on transaction type
    // DEBIT = negative amount, CREDIT = positive amount
    const signedAmount = applyCurrencySign(amountInCents, type.value as TransactionType)
    const signedOriginalAmount = originalAmountInCents
      ? applyCurrencySign(originalAmountInCents, type.value as TransactionType)
      : undefined

    if (editTransactionId) {
      // For updates, construct the proper data object
      const updateData: {
        accountId?: number
        categoryId?: number
        type?: number
        amount?: number
        memo?: string
        originalCurrencyId?: number
        originalAmount?: number
        timestamp?: Date
      } = {
        type: type.value,
        amount: signedAmount,
        memo: memo.value.trim() || undefined,
        originalCurrencyId: originalCurrencyId.value || undefined,
        originalAmount: signedOriginalAmount,
        timestamp: new Date(timestamp.value),
      }

      // For transfers, handle accountId correctly based on whether the UI was swapped
      if (type.value === TransactionType.TRANSFER) {
        updateData.categoryId = undefined
        // If the UI was swapped (editing credit side), we need to use the "to" account
        // as the actual accountId for this transaction
        updateData.accountId = isTransferSwapped.value
          ? toAccountId.value || undefined
          : accountId.value || undefined
      } else {
        updateData.accountId = accountId.value || undefined
        updateData.categoryId = categoryId.value || undefined
      }

      transaction.update(editTransactionId, updateData)
    } else {
      if (type.value === TransactionType.TRANSFER) {
        // Use account transfer method for transfers
        account.transfer(
          accountId.value!,
          toAccountId.value!,
          Math.abs(signedAmount),
          memo.value.trim() || undefined,
          new Date(timestamp.value),
        )
      } else {
        // For regular transactions, create with required fields
        transaction.create({
          groupId: group.selectedId.value,
          accountId: accountId.value!,
          categoryId: categoryId.value!,
          type: type.value,
          amount: signedAmount,
          memo: memo.value.trim() || undefined,
          originalCurrencyId: originalCurrencyId.value || undefined,
          originalAmount: signedOriginalAmount,
          timestamp: new Date(timestamp.value),
        })
      }
    }
  }

  return (
    <section class="page-layout">
      <PageTitle showGroupSelector>
        {editTransactionId ? "Transactions - Edit" : "Transactions - Create"}
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
              <div class="sm:col-span-6">
                <label class="label">
                  Transaction Type:
                </label>
                <div class="mt-2">
                  <div class="space-y-6 sm:flex sm:items-center sm:space-x-10 sm:space-y-0">
                    <div class="flex items-center gap-2">
                      <input
                        id="type-debit"
                        name="transaction-type"
                        type="radio"
                        checked={type.value === TransactionType.DEBIT}
                        class="radio"
                        data-e2e="transaction-type-debit"
                        onChange={() => {
                          type.value = TransactionType.DEBIT
                          // Clear category selection when switching type to ensure proper filtering
                          categoryId.value = null
                          toAccountId.value = null
                        }}
                      />
                      <label for="type-debit" class="label">
                        Debit (Money Out)
                      </label>
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        id="type-credit"
                        name="transaction-type"
                        type="radio"
                        checked={type.value === TransactionType.CREDIT}
                        class="radio"
                        data-e2e="transaction-type-credit"
                        onChange={() => {
                          type.value = TransactionType.CREDIT
                          // Clear category selection when switching type to ensure proper filtering
                          categoryId.value = null
                          toAccountId.value = null
                        }}
                      />
                      <label for="type-credit" class="label">
                        Credit (Money In)
                      </label>
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        id="type-transfer"
                        name="transaction-type"
                        type="radio"
                        checked={type.value === TransactionType.TRANSFER}
                        class="radio"
                        data-e2e="transaction-type-transfer"
                        onChange={() => {
                          type.value = TransactionType.TRANSFER
                          // Clear category for transfers
                          categoryId.value = null
                          // Set default to account if available
                          if (groupAccounts.value.length > 1) {
                            toAccountId.value = groupAccounts.value[1].id
                          }
                        }}
                      />
                      <label for="type-transfer" class="label">
                        Transfer (Between Accounts)
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category field - only show for non-transfer transactions */}
              {type.value !== TransactionType.TRANSFER && (
                <div class="sm:col-span-6">
                  <label for="category" class="label">
                    Category:
                  </label>
                  <div class="mt-2">
                    <select
                      id="category"
                      class="input"
                      value={categoryId.value || ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value
                        categoryId.value = value ? parseInt(value) : null
                      }}
                      required={type.value !== TransactionType.TRANSFER}
                    >
                      <option value="">Select a category...</option>
                      {groupCategories.value.map((cat) => (
                        <option
                          key={cat.id}
                          value={cat.id}
                          class={cat.deletedAt ? "text-gray-400 italic" : ""}
                        >
                          {cat.deletedAt ? "[DELETED] " : ""}
                          {cat.icon ? `${cat.icon} ` : ""}
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div class="sm:col-span-6">
                <label for="account" class="label">
                  {type.value === TransactionType.TRANSFER ? "From Account:" : "Account:"}
                </label>
                <div class="mt-2">
                  <select
                    id="account"
                    class="input"
                    data-e2e="transaction-from-account-select"
                    value={accountId.value || ""}
                    onChange={(e) => {
                      const value = e.currentTarget.value
                      accountId.value = value ? parseInt(value) : null
                    }}
                    required
                  >
                    <option value="">Select an account...</option>
                    {groupAccounts.value.map((acc) => (
                      <option
                        key={acc.id}
                        value={acc.id}
                        class={acc.deletedAt ? "text-gray-400 italic" : ""}
                      >
                        {acc.deletedAt ? "[DELETED] " : ""}
                        {acc.name} ({currency.getById(acc.currencyId).code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* To Account field - only show for transfers */}
              {type.value === TransactionType.TRANSFER && (
                <div class="sm:col-span-6">
                  <label for="toAccount" class="label">
                    To Account:
                  </label>
                  <div class="mt-2">
                    <select
                      id="toAccount"
                      class="input"
                      data-e2e="transaction-to-account-select"
                      value={toAccountId.value || ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value
                        toAccountId.value = value ? parseInt(value) : null
                      }}
                      required={type.value === TransactionType.TRANSFER}
                    >
                      <option value="">Select destination account...</option>
                      {groupAccounts.value
                        .filter((acc) => acc.id !== accountId.value) // Exclude the from account
                        .map((acc) => (
                          <option
                            key={acc.id}
                            value={acc.id}
                            class={acc.deletedAt ? "text-gray-400 italic" : ""}
                          >
                            {acc.deletedAt ? "[DELETED] " : ""}
                            {acc.name} ({currency.getById(acc.currencyId).code})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              <div class="sm:col-span-2">
                <label for="amount" class="label">
                  Amount:
                </label>
                <div class="mt-2">
                  <input
                    type="number"
                    id="amount"
                    class="input"
                    data-e2e="transaction-amount-input"
                    placeholder="0.00"
                    value={amount.value}
                    onInput={(e) => amount.value = e.currentTarget.value}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>

              {/* Original Currency field - hide for transfers since accounts have different currencies */}
              {type.value !== TransactionType.TRANSFER && (
                <div class="sm:col-span-2">
                  <label for="originalCurrency" class="label">
                    Original Currency (optional):
                  </label>
                  <div class="mt-2">
                    <CurrencySelector
                      id="originalCurrency"
                      value={originalCurrencyId.value}
                      onChange={(id) => originalCurrencyId.value = id}
                      placeholder="Select original currency..."
                      disabled={isState(EditorState.IN_PROGRESS)}
                    />
                  </div>
                </div>
              )}

              {/* Original Amount field - hide for transfers */}
              {type.value !== TransactionType.TRANSFER && (
                <div class="sm:col-span-2">
                  <label for="originalAmount" class="label">
                    Original Amount (optional):
                  </label>
                  <div class="mt-2">
                    <input
                      type="number"
                      id="originalAmount"
                      class="input"
                      placeholder="0.00"
                      value={originalAmount.value}
                      onInput={(e) => originalAmount.value = e.currentTarget.value}
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>
              )}

              <div class="sm:col-span-2">
                <label for="timestamp" class="label">
                  Date & Time:
                </label>
                <div class="mt-2">
                  <input
                    type="datetime-local"
                    id="timestamp"
                    class="input"
                    data-e2e="transaction-timestamp-input"
                    value={timestamp.value}
                    onInput={(e) => timestamp.value = e.currentTarget.value}
                    required
                  />
                </div>
              </div>

              <div class="sm:col-span-6">
                <label for="memo" class="label">
                  Memo (optional):
                </label>
                <div class="mt-2">
                  <textarea
                    id="memo"
                    class="input"
                    data-e2e="transaction-memo-input"
                    placeholder={type.value === TransactionType.TRANSFER
                      ? "Notes about this transfer..."
                      : "Notes about this transaction..."}
                    value={memo.value}
                    onInput={(e) => memo.value = e.currentTarget.value}
                    rows={3}
                    maxLength={500}
                  />
                  <div class="text-sm text-gray-500 mt-1">
                    {memo.value.length}/500 characters
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <Link href={routes.transactions.href} class="btn btn-link ml-auto">
              Cancel
            </Link>
            <button
              type="submit"
              class="btn btn-primary"
              data-e2e="transaction-submit-button"
              disabled={!accountId.value ||
                (type.value !== TransactionType.TRANSFER && !categoryId.value) ||
                (type.value === TransactionType.TRANSFER && !toAccountId.value) ||
                !amount.value.trim() ||
                !timestamp.value}
            >
              {isState(EditorState.IN_PROGRESS) && <IconLoading />}
              {editTransactionId ? "Update" : "Create"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
