import { type Signal, useComputed, useSignal, useSignalEffect } from "@preact/signals"
import { currency } from "@web/state/currency.ts"
import { exchangeRate } from "@web/state/exchange-rate.ts"
import { formatCentsToInput, parseCurrencyInput } from "@shared/helpers/format.ts"

interface EnhancedMultiCurrencyInputProps {
  // Account currency (the currency in which transaction is recorded)
  accountCurrencyId: number

  // Original currency (vendor's currency if different from account) - as signal
  originalCurrencyId: Signal<number | null>
  onOriginalCurrencyChange: (currencyId: number | null) => void

  // Amount in account currency (always in cents) - as signal
  accountAmount: Signal<string>
  onAccountAmountChange: (value: string) => void

  // Amount in original currency (always in cents) - as signal
  originalAmount: Signal<string>
  onOriginalAmountChange: (value: string) => void

  // UI props
  id?: string
  required?: boolean
  disabled?: boolean
  dataE2E?: string
}

export function EnhancedMultiCurrencyInput(props: EnhancedMultiCurrencyInputProps) {
  // Flag to track which field the user is actively editing
  const editingField = useSignal<"account" | "original" | null>(null)

  // Get currency details - computed will track props.accountCurrencyId and props.originalCurrencyId
  const accountCurrency = useComputed(() => currency.getById(props.accountCurrencyId))
  const originalCurrency = useComputed(() =>
    props.originalCurrencyId.value ? currency.getById(props.originalCurrencyId.value) : null
  )

  // Determine if we're in multi-currency mode - will recompute when props change
  const isMultiCurrency = useComputed(
    () =>
      props.originalCurrencyId.value !== null &&
      props.originalCurrencyId.value !== props.accountCurrencyId,
  )

  // Get exchange rate if in multi-currency mode
  const currentRate = useComputed(() => {
    if (!isMultiCurrency.value || !props.originalCurrencyId.value) return null
    return exchangeRate.getRate(props.originalCurrencyId.value, props.accountCurrencyId)
  })

  // Calculate actual rate based on user inputs (may differ from stored rate)
  const actualRate = useComputed(() => {
    if (!isMultiCurrency.value) return null

    const originalAmountCents = parseCurrencyInput(props.originalAmount.value)
    const accountAmountCents = parseCurrencyInput(props.accountAmount.value)

    if (!originalAmountCents || !accountAmountCents || originalAmountCents === 0) {
      return null
    }

    return accountAmountCents / originalAmountCents
  })

  // Calculate rate difference percentage
  const rateDifference = useComputed(() => {
    if (!currentRate.value || !actualRate.value) return null

    const diff = ((actualRate.value - currentRate.value) / currentRate.value) * 100
    return diff
  })

  // Auto-update account amount when original amount changes (only if user is editing original)
  useSignalEffect(() => {
    if (editingField.value !== "original" || !isMultiCurrency.value || !currentRate.value) {
      return
    }

    const originalAmountCents = parseCurrencyInput(props.originalAmount.value)
    if (originalAmountCents === null) return

    const convertedAmount = Math.round(originalAmountCents * currentRate.value)
    const newAccountAmount = formatCentsToInput(convertedAmount)

    // Only update if different to avoid infinite loops
    if (newAccountAmount !== props.accountAmount.value) {
      props.onAccountAmountChange(newAccountAmount)
    }
  })

  // Auto-update account amount when currency changes and there's an original amount
  useSignalEffect(() => {
    if (!isMultiCurrency.value || !currentRate.value) {
      return
    }

    const originalAmountCents = parseCurrencyInput(props.originalAmount.value)
    if (originalAmountCents === null) return

    const convertedAmount = Math.round(originalAmountCents * currentRate.value)
    const newAccountAmount = formatCentsToInput(convertedAmount)

    // Only update if different to avoid infinite loops
    if (newAccountAmount !== props.accountAmount.value) {
      props.onAccountAmountChange(newAccountAmount)
    }
  })

  const handleOriginalAmountChange = (value: string) => {
    editingField.value = "original"
    props.onOriginalAmountChange(value)
  }

  const handleAccountAmountChange = (value: string) => {
    editingField.value = "account"
    props.onAccountAmountChange(value)
  }

  const handleOriginalAmountBlur = () => {
    editingField.value = null
  }

  const handleAccountAmountBlur = () => {
    editingField.value = null
  }

  const handleCurrencySelect = (currencyId: number) => {
    if (currencyId === props.accountCurrencyId) {
      // Same as account currency - exit multi-currency mode
      props.onOriginalCurrencyChange(null)
      props.onOriginalAmountChange("")
    } else {
      // Different currency - enter multi-currency mode
      props.onOriginalCurrencyChange(currencyId)
      // Copy current account amount to original amount if original is empty
      if (!props.originalAmount.value && props.accountAmount.value) {
        props.onOriginalAmountChange(props.accountAmount.value)
      }
    }
  }

  return (
    <div class="space-y-3">
      {/* Vendor Currency Selector - Always visible */}
      <div>
        <label for={`${props.id}-currency`} class="label text-sm">
          Vendor Currency (optional):
        </label>
        <div class="mt-1">
          <select
            id={`${props.id}-currency`}
            class="input"
            value={props.originalCurrencyId.value || props.accountCurrencyId}
            onChange={(e) => handleCurrencySelect(parseInt(e.currentTarget.value))}
            disabled={props.disabled}
            data-e2e={`${props.dataE2E}-currency-selector`}
          >
            <option value={props.accountCurrencyId}>
              {accountCurrency.value.code} - Same as account (default)
            </option>
            {currency.list.value
              .filter((c) => !c.deletedAt && c.id !== props.accountCurrencyId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.symbol || c.code} {c.code} - {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Original Amount Field - Always visible when different currency selected */}
      {isMultiCurrency.value && originalCurrency.value && (
        <div>
          <label for={`${props.id}-original`} class="label text-sm">
            Amount in {originalCurrency.value.code}{" "}
            <span class="text-gray-500">(Vendor Currency)</span>
          </label>
          <div class="mt-1 relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span class="text-gray-500 sm:text-sm">
                {originalCurrency.value.symbol || originalCurrency.value.code}
              </span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              id={`${props.id}-original`}
              class="input pl-12"
              placeholder="0.00"
              value={props.originalAmount.value}
              onInput={(e) => handleOriginalAmountChange(e.currentTarget.value)}
              onBlur={handleOriginalAmountBlur}
              required={props.required && isMultiCurrency.value}
              disabled={props.disabled}
              data-e2e={`${props.dataE2E}-original`}
            />
          </div>
        </div>
      )}

      {/* Account Amount Field - Always visible */}
      <div>
        <label for={props.id} class="label text-sm">
          {isMultiCurrency.value
            ? (
              <>
                Amount in {accountCurrency.value.code}{" "}
                <span class="text-gray-500">(Account Currency)</span>
              </>
            )
            : "Amount"}
        </label>
        <div class="mt-1 relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span class="text-gray-500 sm:text-sm">
              {accountCurrency.value.symbol || accountCurrency.value.code}
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            id={props.id}
            class="input pl-12"
            placeholder="0.00"
            value={props.accountAmount.value}
            onInput={(e) => handleAccountAmountChange(e.currentTarget.value)}
            onBlur={handleAccountAmountBlur}
            required={props.required}
            disabled={props.disabled}
            data-e2e={props.dataE2E}
          />
        </div>
      </div>

      {/* Exchange Rate Information */}
      {isMultiCurrency.value && currentRate.value && originalCurrency.value && (
        <div class="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-gray-700">Exchange Rate:</span>
            <span class="font-medium">
              1 {originalCurrency.value.code} = {currentRate.value.toFixed(4)}{" "}
              {accountCurrency.value.code}
            </span>
          </div>

          {actualRate.value && rateDifference.value !== null &&
            Math.abs(rateDifference.value) > 1 && (
            <div class="border-t border-blue-300 pt-2">
              <div class="flex items-center justify-between">
                <span class="text-gray-700">Actual Rate (your input):</span>
                <span class="font-medium">
                  1 {originalCurrency.value.code} = {actualRate.value.toFixed(4)}{" "}
                  {accountCurrency.value.code}
                </span>
              </div>
              <div class="flex items-center justify-between mt-1">
                <span class="text-gray-700">Difference:</span>
                <span
                  class={`font-medium ${
                    rateDifference.value > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {rateDifference.value > 0 ? "+" : ""}
                  {rateDifference.value.toFixed(2)}%
                </span>
              </div>
              <div class="text-xs text-gray-600 mt-2 italic">
                Your bank may have charged a different rate than the market rate
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      {isMultiCurrency.value && (
        <div class="text-xs text-gray-500">
          <p>
            💡 <strong>Tip:</strong>{" "}
            Enter the amount in the vendor's currency (original amount). The account amount will be
            calculated automatically using the current exchange rate. You can also manually adjust
            the account amount if your bank charged a different rate.
          </p>
        </div>
      )}
    </div>
  )
}
