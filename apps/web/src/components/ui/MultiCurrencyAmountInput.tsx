import { useComputed, useSignal } from "@preact/signals"
import { CurrencySelector } from "./CurrencySelector.tsx"
import { CurrencyDisplay } from "./CurrencyDisplay.tsx"
import { currency } from "@web/state/currency.ts"
import { exchangeRate } from "@web/state/exchange-rate.ts"
import { convertAmount } from "@shared/helpers/currency.ts"
import { formatCentsToInput, parseCurrencyInput } from "@shared/helpers/format.ts"

interface MultiCurrencyAmountInputProps {
  /** Amount in smallest currency unit (cents) */
  amount: number
  /** Currency ID for the amount */
  currencyId: number
  /** Target currency ID for display/conversion (usually account currency) */
  targetCurrencyId: number
  /** Callback when amount changes */
  onAmountChange: (amount: number) => void
  /** Callback when currency changes */
  onCurrencyChange: (currencyId: number) => void
  /** Whether to show currency selector */
  showCurrencySelector?: boolean
  /** Whether to show conversion preview */
  showConversion?: boolean
  /** Input placeholder */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Whether the input is required */
  required?: boolean
  /** HTML name attribute */
  name?: string
  /** HTML id attribute */
  id?: string
  /** Additional CSS classes for the container */
  class?: string
  /** Test ID for e2e testing */
  "data-e2e"?: string
}

/**
 * MultiCurrencyAmountInput - Advanced amount input with multi-currency support
 *
 * Features:
 * - Amount input with currency formatting
 * - Optional currency selector
 * - Real-time conversion preview
 * - Support for cross-currency transactions
 * - Proper validation and formatting
 */
export function MultiCurrencyAmountInput({
  amount,
  currencyId,
  targetCurrencyId,
  onAmountChange,
  onCurrencyChange,
  showCurrencySelector = true,
  showConversion = true,
  placeholder = "0.00",
  disabled = false,
  required = false,
  name = "amount",
  id = "amount",
  class: className = "",
  "data-e2e": dataE2e,
}: MultiCurrencyAmountInputProps) {
  const inputValue = useSignal(formatCentsToInput(amount))

  // Computed conversion amount and rate
  const conversion = useComputed(() => {
    if (!showConversion || currencyId === targetCurrencyId || amount === 0) {
      return null
    }

    try {
      const exchangeRates = exchangeRate.getAll()
      const convertedAmount = convertAmount(amount, currencyId, targetCurrencyId, exchangeRates)
      const rate = convertAmount(100, currencyId, targetCurrencyId, exchangeRates) // Use 100 cents for display
      return {
        amount: convertedAmount,
        rate: rate,
      }
    } catch (error) {
      console.warn("Conversion failed:", error)
      return null
    }
  })

  function handleAmountInput(e: Event) {
    const input = e.target as HTMLInputElement
    const value = input.value
    inputValue.value = value

    // Parse and convert to cents
    const parsed = parseCurrencyInput(value)
    if (parsed !== null) {
      onAmountChange(parsed)
    }
  }

  function handleCurrencyChange(newCurrencyId: number | null) {
    if (newCurrencyId) {
      onCurrencyChange(newCurrencyId)
      // Keep the same input value but update the currency context
      inputValue.value = formatCentsToInput(amount)
    }
  }

  return (
    <div class={`space-y-2 ${className}`}>
      <div class="flex gap-2">
        {/* Amount Input */}
        <div class="flex-1">
          <input
            type="text"
            inputMode="decimal"
            id={id}
            name={name}
            class="input text-right"
            placeholder={placeholder}
            value={inputValue.value}
            onInput={handleAmountInput}
            disabled={disabled}
            required={required}
            data-e2e={dataE2e}
          />
        </div>

        {/* Currency Selector */}
        {showCurrencySelector && (
          <div class="w-48">
            <CurrencySelector
              value={currencyId}
              onChange={handleCurrencyChange}
              id={`${id}-currency`}
              disabled={disabled}
              showClearButton={false}
              placeholder="Currency..."
            />
          </div>
        )}
      </div>

      {/* Conversion Preview */}
      {conversion.value && (
        <div class="text-sm text-gray-600 dark:text-gray-400 border-l-2 border-blue-200 dark:border-blue-800 pl-3">
          <div class="flex items-center justify-between">
            <span>
              Converts to{" "}
              <CurrencyDisplay
                amount={conversion.value.amount}
                currency={targetCurrencyId}
                class="font-medium text-gray-900 dark:text-gray-100"
              />
            </span>
            <span class="text-xs">
              Rate: 1 {currency.getById(currencyId).code} ≈{"  "}
              <CurrencyDisplay
                amount={conversion.value.rate}
                currency={targetCurrencyId}
                class="font-medium"
              />
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
