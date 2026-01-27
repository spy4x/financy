import type { Currency, ExchangeRate } from "@shared/types"

/**
 * Currency converter that handles conversions through USD as intermediary.
 * All exchange rates in the system use USD as the base currency (fromCurrencyId: 1).
 *
 * For conversions between non-USD currencies, we use USD as a bridge:
 * - Direct: USD → Target (use stored rate)
 * - Reverse: Target → USD (use 1 / stored rate)
 * - Cross-rate: Source → Target (Source → USD → Target)
 *
 * Example: RUB → SGD
 * 1. Find RUB → USD rate (inverse of USD → RUB)
 * 2. Find USD → SGD rate (direct)
 * 3. Multiply: (1 / USD_RUB) × USD_SGD
 */

const USD_CURRENCY_ID = 1

export interface CurrencyConversionResult {
  rate: number
  /** Indicates if this is a synthetic rate calculated through USD */
  isSynthetic: boolean
  /** Description of how the rate was calculated (for debugging) */
  path: string
}

/**
 * Get the exchange rate between two currencies.
 * Returns null if conversion is not possible with available rates.
 *
 * @param fromCurrencyId Source currency ID
 * @param toCurrencyId Target currency ID
 * @param exchangeRates All available exchange rates (filtered to latest per pair)
 * @returns Conversion result with rate and metadata, or null if not possible
 */
export function getExchangeRate(
  fromCurrencyId: number,
  toCurrencyId: number,
  exchangeRates: ExchangeRate[],
  currencies?: Currency[],
): CurrencyConversionResult | null {
  // Same currency = 1:1
  if (fromCurrencyId === toCurrencyId) {
    return {
      rate: 1,
      isSynthetic: false,
      path: "same_currency",
    }
  }

  // Get the latest rate for each currency pair
  const latestRates = getLatestRates(exchangeRates)

  // Try direct conversion (stored rate)
  const directRate = findRate(latestRates, fromCurrencyId, toCurrencyId)
  if (directRate) {
    return {
      rate: directRate.rate,
      isSynthetic: false,
      path: `${fromCurrencyId}→${toCurrencyId}`,
    }
  }

  // Try reverse conversion (1 / stored rate)
  const reverseRate = findRate(latestRates, toCurrencyId, fromCurrencyId)
  if (reverseRate) {
    return {
      rate: 1 / reverseRate.rate,
      isSynthetic: false,
      path: `${fromCurrencyId}←${toCurrencyId} (inverse)`,
    }
  }

  // Determine USD currency id from provided currencies if available
  const usdId = (() => {
    if (currencies && currencies.length > 0) {
      const usd = currencies.find((c) => c.code === "USD")
      if (usd) return usd.id
    }
    return USD_CURRENCY_ID
  })()

  // Try conversion through USD as intermediary
  // Case 1: From → USD → To
  if (fromCurrencyId !== usdId && toCurrencyId !== usdId) {
    const fromToUsd = getExchangeRate(fromCurrencyId, usdId, exchangeRates, currencies)
    const usdToTarget = getExchangeRate(usdId, toCurrencyId, exchangeRates, currencies)

    if (fromToUsd && usdToTarget) {
      return {
        rate: fromToUsd.rate * usdToTarget.rate,
        isSynthetic: true,
        path: `${fromCurrencyId}→${USD_CURRENCY_ID}→${toCurrencyId}`,
      }
    }
  }

  // No conversion path found
  return null
}

/**
 * Get exchange rate for display (not for conversion).
 * Returns raw rate as a decimal number for UI display only.
 */
export function getExchangeRateForDisplay(
  fromCurrencyId: number,
  toCurrencyId: number,
  exchangeRates: ExchangeRate[],
  currencies?: Currency[],
): number | null {
  const result = getExchangeRate(fromCurrencyId, toCurrencyId, exchangeRates, currencies)
  return result?.rate ?? null
}

/**
 * Get all exchange rates for a given base currency.
 * Returns a map of target currency ID to conversion result.
 *
 * @param fromCurrencyId Base currency ID
 * @param exchangeRates All available exchange rates
 * @returns Map of currency ID to conversion result
 */
export function getRatesForCurrency(
  fromCurrencyId: number,
  exchangeRates: ExchangeRate[],
  currencies?: Currency[],
): Map<number, CurrencyConversionResult> {
  const ratesMap = new Map<number, CurrencyConversionResult>()

  // Get all unique target currencies from exchange rates
  const allCurrencyIds = new Set<number>()
  exchangeRates.forEach((rate) => {
    if (!rate.deletedAt) {
      allCurrencyIds.add(rate.fromCurrencyId)
      allCurrencyIds.add(rate.toCurrencyId)
    }
  })

  // Calculate rate for each target currency
  allCurrencyIds.forEach((toCurrencyId) => {
    if (toCurrencyId === fromCurrencyId) {
      return // Skip same currency
    }

    const result = getExchangeRate(fromCurrencyId, toCurrencyId, exchangeRates, currencies)
    if (result) {
      ratesMap.set(toCurrencyId, result)
    }
  })

  return ratesMap
}

/**
 * Helper: Get latest rate for each currency pair
 */
function getLatestRates(exchangeRates: ExchangeRate[]): Map<string, ExchangeRate> {
  const latestMap = new Map<string, ExchangeRate>()

  exchangeRates
    .filter((r) => !r.deletedAt)
    .forEach((rate) => {
      const key = `${rate.fromCurrencyId}-${rate.toCurrencyId}`
      const existing = latestMap.get(key)

      if (!existing || new Date(rate.date) > new Date(existing.date)) {
        latestMap.set(key, rate)
      }
    })

  return latestMap
}

/**
 * Helper: Find a specific rate in the latest rates map
 */
function findRate(
  latestRates: Map<string, ExchangeRate>,
  fromCurrencyId: number,
  toCurrencyId: number,
): ExchangeRate | null {
  const key = `${fromCurrencyId}-${toCurrencyId}`
  return latestRates.get(key) || null
}

/**
 * Convert an amount from one currency to another.
 *
 * @param amount Amount in the source currency (in smallest unit, e.g., cents)
 * @param fromCurrencyId Source currency ID
 * @param toCurrencyId Target currency ID
 * @param exchangeRates All available exchange rates
 * @returns Converted amount in the target currency (in smallest unit), or null if conversion not possible
 */
export function convertAmount(
  amount: number,
  fromCurrencyId: number,
  toCurrencyId: number,
  exchangeRates: ExchangeRate[],
  currencies?: Currency[],
): number | null {
  const conversion = getExchangeRate(fromCurrencyId, toCurrencyId, exchangeRates, currencies)
  if (!conversion) {
    return null
  }

  const fromDecimals = getDecimalPlaces(fromCurrencyId, currencies)
  const toDecimals = getDecimalPlaces(toCurrencyId, currencies)
  const scale = Math.pow(10, toDecimals) / Math.pow(10, fromDecimals)
  return Math.round(amount * conversion.rate * scale)
}

function getDecimalPlaces(currencyId: number, currencies?: Currency[]): number {
  if (!currencies || currencies.length === 0) return 2
  const found = currencies.find((currency) => currency.id === currencyId)
  return found?.decimalPlaces ?? 2
}
