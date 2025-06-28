import type { Currency, CurrencyType } from "@shared/types"

/**
 * Search currencies by name or code with optional type filtering
 * @param currencies - Array of currencies from database
 * @param searchTerm - Search term to match against code or name
 * @param filterType - Optional type filter
 * @returns Filtered array of currencies matching the search term
 */
export function searchCurrencies(
  currencies: Currency[],
  searchTerm: string,
  filterType?: CurrencyType,
): Currency[] {
  const normalizedSearch = searchTerm.toLowerCase().trim()
  if (!normalizedSearch) return getCurrenciesByType(currencies, filterType)

  return getCurrenciesByType(currencies, filterType).filter((currency) =>
    currency.code.toLowerCase().includes(normalizedSearch) ||
    currency.name.toLowerCase().includes(normalizedSearch)
  )
}

/**
 * Get currency display format with proper decimal places
 * @param amount - Amount in smallest currency unit (e.g., cents)
 * @param currency - Currency object from database
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const divisor = Math.pow(10, currency.decimalPlaces)
  const value = amount / divisor

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.code,
    minimumFractionDigits: currency.decimalPlaces,
    maximumFractionDigits: currency.decimalPlaces,
  }).format(value)
}

/**
 * Convert amount to smallest currency unit
 * @param amount - Display amount (e.g., 10.50)
 * @param currency - Currency object from database
 * @returns Amount in smallest unit (e.g., 1050 cents)
 */
export function toSmallestUnit(amount: number, currency: Currency): number {
  const multiplier = Math.pow(10, currency.decimalPlaces)
  return Math.round(amount * multiplier)
}

/**
 * Convert amount from smallest currency unit to display amount
 * @param amount - Amount in smallest unit (e.g., 1050 cents)
 * @param currency - Currency object from database
 * @returns Display amount (e.g., 10.50)
 */
export function fromSmallestUnit(amount: number, currency: Currency): number {
  const divisor = Math.pow(10, currency.decimalPlaces)
  return amount / divisor
}

/**
 * Filter currencies by type
 * @param currencies - Array of currencies from database
 * @param filterType - Type of currencies to return (CurrencyType.FIAT, CurrencyType.CRYPTO, or undefined for all)
 * @returns Filtered array of currencies
 */
export function getCurrenciesByType(
  currencies: Currency[],
  filterType?: CurrencyType,
): Currency[] {
  if (filterType === undefined) return currencies
  return currencies.filter((currency) => currency.type === filterType)
}

/**
 * Find currency by code
 * @param currencies - Array of currencies from database
 * @param code - Currency code to find
 * @returns Currency object or undefined if not found
 */
export function findCurrencyByCode(currencies: Currency[], code: string): Currency | undefined {
  return currencies.find((currency) => currency.code.toLowerCase() === code.toLowerCase())
}

/**
 * Get currency display info with fallback
 * @param currencies - Array of currencies from database
 * @param code - Currency code to find
 * @returns Currency object or fallback object if not found
 */
export function getCurrencyDisplay(currencies: Currency[], code: string): Currency {
  return findCurrencyByCode(currencies, code) || {
    id: 0,
    code: code.toUpperCase(),
    name: code.toUpperCase(),
    symbol: undefined,
    type: 1, // fiat
    decimalPlaces: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }
}
