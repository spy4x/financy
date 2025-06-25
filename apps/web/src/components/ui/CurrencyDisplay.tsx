import { formatCurrency } from "@shared/helpers/format.ts"

interface CurrencyDisplayProps {
  /** Amount in smallest currency unit (cents) */
  amount: number
  /** ISO 4217 currency code */
  currency: string
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
 */
export function CurrencyDisplay({
  amount,
  currency,
  class: className = "",
  highlightNegative = false,
  symbolClass = "font-medium",
  amountClass = "",
}: CurrencyDisplayProps) {
  const formatted = formatCurrency(amount, currency)
  const isNegative = amount < 0

  const containerClass = `${className} ${
    highlightNegative && isNegative ? "text-red-600 font-semibold" : ""
  }`.trim()

  return (
    <span class={containerClass}>
      <span class={symbolClass}>{formatted.symbol}</span>{" "}
      <span class={amountClass}>{formatted.amount}</span>
    </span>
  )
}
