import { useComputed, useSignal } from "@preact/signals"
import { AccountSelector } from "./ui/AccountSelector.tsx"
import { MultiCurrencyAmountInput } from "./ui/MultiCurrencyAmountInput.tsx"
import { CurrencyDisplay } from "./ui/CurrencyDisplay.tsx"
import { IconLoading } from "@client/icons"
import { account } from "@web/state/account.ts"
import { currency } from "@web/state/currency.ts"
import { exchangeRate } from "@web/state/exchange-rate.ts"
import { convertAmount } from "@shared/helpers/currency.ts"
import { formatCentsToInput, parseCurrencyInput } from "@shared/helpers/format.ts"

interface TransferFormProps {
  /** Initial from account ID */
  fromAccountId?: number | null
  /** Initial to account ID */
  toAccountId?: number | null
  /** Initial amount in cents */
  initialAmount?: number
  /** Initial memo */
  initialMemo?: string
  /** Whether the form is disabled */
  disabled?: boolean
  /** Callback when transfer is submitted */
  onSubmit: (transfer: {
    fromAccountId: number
    toAccountId: number
    amount: number
    memo?: string
    timestamp: Date
  }) => void
  /** Callback when form is cancelled */
  onCancel?: () => void
}

/**
 * TransferForm - Specialized form for cross-currency account transfers
 *
 * Features:
 * - Account selection with currency display
 * - Cross-currency amount input with conversion preview
 * - Exchange rate display with manual override option
 * - Real-time conversion calculations
 * - Validation for account selection and amounts
 */
export function TransferForm({
  fromAccountId: initialFromAccountId,
  toAccountId: initialToAccountId,
  initialAmount = 0,
  initialMemo = "",
  disabled = false,
  onSubmit,
  onCancel,
}: TransferFormProps) {
  // Form state
  const fromAccountId = useSignal<number | null>(initialFromAccountId || null)
  const toAccountId = useSignal<number | null>(initialToAccountId || null)
  const amount = useSignal(formatCentsToInput(initialAmount))
  const memo = useSignal(initialMemo)
  const timestamp = useSignal(new Date().toISOString().slice(0, 16))
  const showManualRate = useSignal(false)
  const manualRate = useSignal("")
  const error = useSignal("")

  // Computed account information
  const fromAccount = useComputed(() =>
    fromAccountId.value ? account.list.value.find((a) => a.id === fromAccountId.value) : null
  )

  const toAccount = useComputed(() =>
    toAccountId.value ? account.list.value.find((a) => a.id === toAccountId.value) : null
  )

  // Check if accounts have different currencies
  const isDifferentCurrency = useComputed(() =>
    fromAccount.value && toAccount.value &&
    fromAccount.value.currencyId !== toAccount.value.currencyId
  )

  // Get currencies
  const fromCurrency = useComputed(() =>
    fromAccount.value ? currency.getById(fromAccount.value.currencyId) : null
  )

  const toCurrency = useComputed(() =>
    toAccount.value ? currency.getById(toAccount.value.currencyId) : null
  )

  // Exchange rate calculation
  const exchangeRateInfo = useComputed(() => {
    if (!fromAccount.value || !toAccount.value || !isDifferentCurrency.value) {
      return null
    }

    try {
      const rates = exchangeRate.getAll()
      const rate =
        convertAmount(100, fromAccount.value.currencyId, toAccount.value.currencyId, rates) / 100
      return {
        rate,
        isManual: false,
        displayText: `1 ${fromCurrency.value?.code} = ${rate.toFixed(4)} ${toCurrency.value?.code}`,
      }
    } catch (error) {
      return {
        rate: null,
        isManual: false,
        displayText: "Exchange rate not available",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  })

  // Converted amount calculation
  const convertedAmount = useComputed(() => {
    const amountInCents = parseCurrencyInput(amount.value)
    if (!amountInCents || !fromAccount.value || !toAccount.value) {
      return null
    }

    if (!isDifferentCurrency.value) {
      return amountInCents // Same currency
    }

    try {
      const rates = exchangeRate.getAll()
      const converted = convertAmount(
        amountInCents,
        fromAccount.value.currencyId,
        toAccount.value.currencyId,
        rates,
      )
      return converted
    } catch (error) {
      console.warn("Conversion failed:", error)
      return null
    }
  })

  // Validation
  const isValid = useComputed(() =>
    fromAccountId.value &&
    toAccountId.value &&
    fromAccountId.value !== toAccountId.value &&
    amount.value.trim() &&
    parseCurrencyInput(amount.value) &&
    parseCurrencyInput(amount.value)! > 0 &&
    timestamp.value
  )

  const handleSubmit = (e: Event) => {
    e.preventDefault()

    if (!isValid.value) {
      error.value = "Please fill in all required fields"
      return
    }

    const amountInCents = parseCurrencyInput(amount.value)
    if (!amountInCents) {
      error.value = "Invalid amount"
      return
    }

    onSubmit({
      fromAccountId: fromAccountId.value!,
      toAccountId: toAccountId.value!,
      amount: amountInCents,
      memo: memo.value.trim() || undefined,
      timestamp: new Date(timestamp.value),
    })
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      {error.value && (
        <div class="p-4 text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error.value}
        </div>
      )}

      {/* Account Selection */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label
            for="fromAccount"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            From Account:
          </label>
          <AccountSelector
            id="fromAccount"
            value={fromAccountId.value}
            onChange={(id) => fromAccountId.value = id}
            excludeAccountId={toAccountId.value || undefined}
            required
            disabled={disabled}
            data-e2e="transfer-from-account"
          />
          {fromAccount.value && (
            <div class="mt-1 text-sm text-gray-500">
              Currency: {currency.getById(fromAccount.value.currencyId).code}
            </div>
          )}
        </div>

        <div>
          <label
            for="toAccount"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            To Account:
          </label>
          <AccountSelector
            id="toAccount"
            value={toAccountId.value}
            onChange={(id) => toAccountId.value = id}
            excludeAccountId={fromAccountId.value || undefined}
            required
            disabled={disabled}
            data-e2e="transfer-to-account"
          />
          {toAccount.value && (
            <div class="mt-1 text-sm text-gray-500">
              Currency: {currency.getById(toAccount.value.currencyId).code}
            </div>
          )}
        </div>
      </div>

      {/* Amount Input */}
      <div>
        <label for="amount" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Transfer Amount:
        </label>
        <MultiCurrencyAmountInput
          id="amount"
          amount={parseCurrencyInput(amount.value) || 0}
          currencyId={fromAccount.value?.currencyId || 1}
          targetCurrencyId={toAccount.value?.currencyId || 1}
          onAmountChange={(value) => amount.value = formatCentsToInput(value)}
          onCurrencyChange={() => {}} // Currency determined by account selection
          showCurrencySelector={false}
          showConversion={!!isDifferentCurrency.value}
          disabled={disabled}
          required
          data-e2e="transfer-amount"
        />
      </div>

      {/* Exchange Rate Information */}
      {isDifferentCurrency.value && (
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
              Exchange Rate:
            </span>
            <button
              type="button"
              class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => showManualRate.value = !showManualRate.value}
            >
              {showManualRate.value ? "Use automatic rate" : "Override rate"}
            </button>
          </div>

          {exchangeRateInfo.value && (
            <div class="text-sm text-blue-800 dark:text-blue-200">
              {exchangeRateInfo.value.displayText}
              {exchangeRateInfo.value.error && (
                <div class="text-red-600 dark:text-red-400 mt-1">
                  {exchangeRateInfo.value.error}
                </div>
              )}
            </div>
          )}

          {/* Manual Rate Override */}
          {showManualRate.value && (
            <div class="mt-3">
              <input
                type="number"
                class="input w-full"
                placeholder="Manual exchange rate"
                value={manualRate.value}
                onInput={(e) => manualRate.value = e.currentTarget.value}
                step="0.0001"
                min="0"
              />
            </div>
          )}

          {/* Conversion Preview */}
          {convertedAmount.value && (
            <div class="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
              <div class="text-sm text-blue-900 dark:text-blue-100">
                <span class="font-medium">You will transfer:</span>
                <div class="flex justify-between items-center mt-1">
                  <span>
                    <CurrencyDisplay
                      amount={parseCurrencyInput(amount.value) || 0}
                      currency={fromAccount.value?.currencyId || 1}
                    />
                  </span>
                  <span class="text-blue-600 dark:text-blue-400">→</span>
                  <span>
                    <CurrencyDisplay
                      amount={convertedAmount.value}
                      currency={toAccount.value?.currencyId || 1}
                    />
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Memo */}
      <div>
        <label for="memo" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Memo (optional):
        </label>
        <textarea
          id="memo"
          class="input w-full"
          placeholder="Notes about this transfer..."
          value={memo.value}
          onInput={(e) => memo.value = e.currentTarget.value}
          rows={3}
          maxLength={500}
          disabled={disabled}
          data-e2e="transfer-memo"
        />
        <div class="text-sm text-gray-500 mt-1">
          {memo.value.length}/500 characters
        </div>
      </div>

      {/* Date & Time */}
      <div>
        <label
          for="timestamp"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Date & Time:
        </label>
        <input
          type="datetime-local"
          id="timestamp"
          class="input"
          value={timestamp.value}
          onInput={(e) => timestamp.value = e.currentTarget.value}
          required
          disabled={disabled}
          data-e2e="transfer-timestamp"
        />
      </div>

      {/* Submit Buttons */}
      <div class="flex gap-3 pt-4">
        {onCancel && (
          <button
            type="button"
            class="btn btn-link flex-1"
            onClick={onCancel}
            disabled={disabled}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          class="btn btn-primary flex-1"
          disabled={disabled || !isValid.value}
          data-e2e="transfer-submit"
        >
          {disabled && <IconLoading />}
          Transfer Funds
        </button>
      </div>
    </form>
  )
}
