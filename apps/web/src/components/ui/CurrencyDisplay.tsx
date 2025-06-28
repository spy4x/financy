import { currency } from "@web/state/currency.ts"

interface CurrencyDisplayProps {
  /** Amount in smallest currency unit (cents) */
  amount: number
  /** Currency ID (number) or legacy currency code (string) - will be migrated to ID only */
  currency: number | string
  /** Additional CSS classes */
  class?: string
  /** Show negative amounts in red */
  highlightNegative?: boolean
  /** Custom symbol and amount styling */
  symbolClass?: string
  amountClass?: string
}

/**
 * Displays a formatted currency amount with symbol and value
 * Handles conversion from cents to currency units and proper formatting
 * Supports both currency ID (number) and legacy currency code (string)
 */
export function CurrencyDisplay({
  amount,
  currency: currencyIdOrCode,
  class: className = "",
  highlightNegative = false,
  symbolClass: _symbolClass = "font-medium",
  amountClass: _amountClass = "",
}: CurrencyDisplayProps) {
  // Handle both currency ID (number) and legacy code (string)
  const formatted = typeof currencyIdOrCode === "number"
    ? currency.format(amount, currencyIdOrCode)
    : currency.format(amount, currency.getByCode(currencyIdOrCode))

  const isNegative = amount < 0

  const containerClass = `${className} ${
    highlightNegative && isNegative ? "text-red-600 font-semibold" : ""
  }`.trim()

  return (
    <span class={containerClass}>
      {formatted}
    </span>
  )
}
