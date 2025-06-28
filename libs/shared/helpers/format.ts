import { TransactionType } from "@shared/types"

/** Formats a decimal number like 13.50354562 to a number with two decimal points, like 13.50 */
export function formatDecimal(value: number): string {
  return value.toFixed(2)
}

/** Formats a date-like string/number/Date to a human-readable format. Example: "12/03/2023 14:30" */
export function formatTime(
  date: undefined | null | number | string | Date,
  options?: { full?: boolean; timeOnly?: boolean; timeZone?: string },
): string {
  if (!date) {
    return "-"
  }
  const targetDate = new Date(date)
  const isToday = new Date().toDateString() === targetDate.toDateString()
  const hoursAndMinutes = targetDate.toLocaleTimeString("en-GB", { // en-GB is used to display time in the format "HH:MM"
    hour: "2-digit",
    minute: "2-digit",
    timeZone: options?.timeZone,
  })
  if (options?.timeOnly) {
    return hoursAndMinutes
  }
  if (isToday && !options?.full) {
    return `Today ${hoursAndMinutes}`
  }
  return targetDate.toLocaleString("en-GB", { // en-GB is used to display dates in the format "DD/MM/YYYY"
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: options?.timeZone,
  }) + ` ${hoursAndMinutes}`
}

/** Formats a string to kebab-case. Example: "Hello World" -> "hello-world" */
export function formatToKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase()
}

/** Formats a word to plural. Example: "cat" -> "cats", "baby" -> "babies" */
export function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    return word.slice(0, -1) + "ies"
  } else if (/(s|sh|ch|x|z)$/.test(word)) {
    return word + "es"
  } else if (word.endsWith("o")) {
    return word + "es"
  } else {
    return word + "s"
  }
}

/** Converts a base64 URL string to a Uint8Array. */
export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/")

  const rawData = globalThis.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

/**
 * Formats a monetary amount stored as cents to a currency display object
 * @param amount Amount in smallest currency unit (cents)
 * @param currency ISO 4217 currency code
 * @returns Object with separate symbol and formatted amount
 * @deprecated Use the new formatCurrency from @shared/constants/currency.ts instead
 */
export function formatCurrency(
  amount: number,
  currency: string,
): { symbol: string; amount: string } {
  // Temporary fallback for legacy compatibility
  const symbol = getBasicCurrencySymbol(currency)
  const formattedAmount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100) // Convert from cents to currency units

  return {
    symbol,
    amount: formattedAmount,
  }
}

/**
 * Basic currency symbol fallback for legacy compatibility
 */
function getBasicCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    CAD: "C$",
    AUD: "A$",
    CHF: "Fr",
    CNY: "¥",
  }
  return symbols[code] || code
}

/**
 * Formats a monetary amount stored as cents to a full currency string
 * @param amount Amount in smallest currency unit (cents)
 * @param currency ISO 4217 currency code
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100) // Convert from cents to currency unit
}

/**
 * Converts cents to a decimal string for form inputs (always positive)
 * @param amount Amount in smallest currency unit (cents)
 * @returns Decimal string representation (e.g., "12.34")
 */
export function formatCentsToInput(amount: number): string {
  return (Math.abs(amount) / 100).toFixed(2)
}

/**
 * Parses currency input string and converts to cents
 * @param value String input from user (e.g., "12.34" or "12")
 * @returns Amount in cents, or null if invalid input
 */
export function parseCurrencyInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = parseFloat(trimmed)
  if (isNaN(parsed) || parsed < 0) return null

  return Math.round(parsed * 100) // Convert to cents
}

/**
 * Converts a signed amount in cents to cents with proper sign based on transaction type
 * @param amount Amount in cents (can be positive or negative)
 * @param transactionType Transaction type (DEBIT or CREDIT)
 * @returns Signed amount in cents (negative for debit, positive for credit)
 */
export function applyCurrencySign(amount: number, transactionType: TransactionType): number {
  const absoluteAmount = Math.abs(amount)
  if (absoluteAmount === 0) return 0 // Avoid negative zero
  return transactionType === TransactionType.DEBIT ? -absoluteAmount : absoluteAmount
}
