import { transaction } from "@web/state/transaction.ts"
import { account } from "@web/state/account.ts"
import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"
import { useComputed, useSignal, useSignalEffect } from "@preact/signals"
import { IconLoading } from "@client/icons"
import { Link, useRoute } from "wouter-preact"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { navigate } from "@client/helpers"
import { routes } from "../_router.tsx"
import { TransactionType } from "@shared/types"
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
  const categoryId = useSignal<number | null>(null)
  const type = useSignal<number>(1) // Default to Debit
  const amount = useSignal("")
  const memo = useSignal("")
  const originalCurrency = useSignal("")
  const originalAmount = useSignal("")
  const createdAt = useSignal("")
  const error = useSignal("")
  const state = useSignal<EditorState>(EditorState.INITIALIZING)

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

    return category.list.value
      .filter((cat) => cat.groupId === selectedGroupId)
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

  // Initialize for edit mode
  useSignalEffect(() => {
    if (isState(EditorState.INITIALIZING)) {
      if (editTransactionId) {
        const existingTransaction = transaction.list.value.find((t) => t.id === editTransactionId)
        if (existingTransaction) {
          accountId.value = existingTransaction.accountId
          categoryId.value = existingTransaction.categoryId
          type.value = existingTransaction.type
          // Always show positive amount in form - sign is determined by type
          amount.value = formatCentsToInput(existingTransaction.amount)
          memo.value = existingTransaction.memo || ""
          originalCurrency.value = existingTransaction.originalCurrency || ""
          originalAmount.value = existingTransaction.originalAmount
            ? formatCentsToInput(existingTransaction.originalAmount)
            : ""
          // Format createdAt as datetime-local input value (YYYY-MM-DDTHH:mm)
          createdAt.value = new Date(existingTransaction.createdAt).toISOString().slice(0, 16)
          error.value = ""
          state.value = EditorState.IDLE
        } else {
          error.value = "Transaction not found"
          state.value = EditorState.ERROR
        }
      } else {
        // Create mode - set defaults
        const accounts = groupAccounts.value
        const categories = groupCategories.value

        accountId.value = accounts.length > 0 ? accounts[0].id : null
        categoryId.value = categories.length > 0 ? categories[0].id : null
        type.value = 1 // Default to Debit
        amount.value = ""
        memo.value = ""
        originalCurrency.value = ""
        originalAmount.value = ""
        // Default to current date and time
        createdAt.value = new Date().toISOString().slice(0, 16)
        error.value = ""
        state.value = EditorState.IDLE
      }
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
    if (!group.selectedId.value) {
      error.value = "Please select a group first"
      state.value = EditorState.ERROR
      return
    }

    if (!accountId.value) {
      error.value = "Account is required"
      state.value = EditorState.ERROR
      return
    }

    if (!categoryId.value) {
      error.value = "Category is required"
      state.value = EditorState.ERROR
      return
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

    const data = {
      accountId: accountId.value,
      categoryId: categoryId.value,
      type: type.value,
      amount: signedAmount,
      memo: memo.value.trim() || undefined,
      originalCurrency: originalCurrency.value.trim() || undefined,
      originalAmount: signedOriginalAmount,
      createdAt: createdAt.value ? new Date(createdAt.value).toISOString() : undefined,
    }

    if (editTransactionId) {
      transaction.update(editTransactionId, data)
    } else {
      transaction.create({
        groupId: group.selectedId.value,
        ...data,
      })
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

      {!group.selectedId.value && (
        <div class="mb-4 p-4 text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md">
          Please select a group first to create a transaction.
        </div>
      )}

      <form onSubmit={handleSubmit} class="card">
        <fieldset disabled={isState(EditorState.IN_PROGRESS) || !group.selectedId.value}>
          <div class="card-body">
            <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div class="sm:col-span-3">
                <label for="account" class="label">
                  Account:
                </label>
                <div class="mt-2">
                  <select
                    id="account"
                    class="input"
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
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div class="sm:col-span-3">
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
                    required
                  >
                    <option value="">Select a category...</option>
                    {groupCategories.value.map((cat) => (
                      <option
                        key={cat.id}
                        value={cat.id}
                        class={cat.deletedAt ? "text-gray-400 italic" : ""}
                      >
                        {cat.deletedAt ? "[DELETED] " : ""}
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div class="sm:col-span-2">
                <label for="type" class="label">
                  Type:
                </label>
                <div class="mt-2">
                  <select
                    id="type"
                    class="input"
                    value={type.value}
                    onChange={(e) => type.value = parseInt(e.currentTarget.value)}
                    required
                  >
                    <option value="1">Debit (Money Out)</option>
                    <option value="2">Credit (Money In)</option>
                  </select>
                </div>
              </div>

              <div class="sm:col-span-2">
                <label for="amount" class="label">
                  Amount:
                </label>
                <div class="mt-2">
                  <input
                    type="number"
                    id="amount"
                    class="input"
                    placeholder="0.00"
                    value={amount.value}
                    onInput={(e) => amount.value = e.currentTarget.value}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div class="sm:col-span-2">
                <label for="originalCurrency" class="label">
                  Original Currency (optional):
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="originalCurrency"
                    class="input"
                    placeholder="e.g., EUR, GBP"
                    value={originalCurrency.value}
                    onInput={(e) => originalCurrency.value = e.currentTarget.value}
                    maxLength={3}
                  />
                </div>
              </div>

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

              <div class="sm:col-span-2">
                <label for="createdAt" class="label">
                  Date & Time:
                </label>
                <div class="mt-2">
                  <input
                    type="datetime-local"
                    id="createdAt"
                    class="input"
                    value={createdAt.value}
                    onInput={(e) => createdAt.value = e.currentTarget.value}
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
                    placeholder="Notes about this transaction..."
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
              disabled={!accountId.value || !categoryId.value || !amount.value.trim() ||
                !createdAt.value || !group.selectedId.value}
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
