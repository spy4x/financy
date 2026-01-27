/**
 * Simple currency conversion helpers
 * These are pure functions for getting exchange rates and converting amounts
 * without any database or external dependencies
 */

import type { Currency, ExchangeRate } from "@shared/types"

/**
 * Get exchange rate between two currencies from provided rates array
 * Returns 1.0 if currencies are the same
 * Uses USD-based conversion if direct rate not available
 */
export function getExchangeRate(
  fromCurrencyId: number,
  toCurrencyId: number,
  exchangeRates: ExchangeRate[],
): number {
  const assertValidRate = (rate: ExchangeRate): void => {
    // Validation: reject non-finite or non-positive rates from storage.
    if (!isFinite(rate.rate) || rate.rate <= 0) {
      throw new Error(`Invalid exchange rate: ${rate.rate}`)
    }
  }

  // Same currency, rate is 1
  if (fromCurrencyId === toCurrencyId) {
    return 1.0
  }

  // Filter out deleted rates
  const activeRates = exchangeRates.filter((rate) => !rate.deletedAt)

  // Try direct rate (from/to)
  const directRate = activeRates.find((rate) =>
    rate.fromCurrencyId === fromCurrencyId && rate.toCurrencyId === toCurrencyId
  )

  if (directRate) {
    assertValidRate(directRate)
    return directRate.rate
  }

  // Try reverse rate (to/from) and calculate inverse
  const reverseRate = activeRates.find((rate) =>
    rate.fromCurrencyId === toCurrencyId && rate.toCurrencyId === fromCurrencyId
  )

  if (reverseRate) {
    assertValidRate(reverseRate)
    return 1 / reverseRate.rate
  }

  // Try USD-based conversion if not direct rate available
  // Try common USD currency IDs (1, 2, 3) as fallback
  const commonUsdIds = [1, 2, 3]

  for (const potentialUsdId of commonUsdIds) {
    if (fromCurrencyId !== potentialUsdId && toCurrencyId !== potentialUsdId) {
      // Check if we have rates involving this potential USD ID
      const hasFromUsdRate = activeRates.some((rate) =>
        (rate.fromCurrencyId === fromCurrencyId && rate.toCurrencyId === potentialUsdId) ||
        (rate.fromCurrencyId === potentialUsdId && rate.toCurrencyId === fromCurrencyId)
      )
      const hasToUsdRate = activeRates.some((rate) =>
        (rate.fromCurrencyId === potentialUsdId && rate.toCurrencyId === toCurrencyId) ||
        (rate.fromCurrencyId === toCurrencyId && rate.toCurrencyId === potentialUsdId)
      )

      if (hasFromUsdRate && hasToUsdRate) {
        try {
          const fromToUSD = getExchangeRate(fromCurrencyId, potentialUsdId, exchangeRates)
          const usdToTarget = getExchangeRate(potentialUsdId, toCurrencyId, exchangeRates)
          return fromToUSD * usdToTarget
        } catch (_error) {
          // This USD ID didn't work, try the next one
          continue
        }
      }
    }
  }

  throw new Error(
    `Exchange rate not found for currencies ${fromCurrencyId} to ${toCurrencyId}`,
  )
}

/**
 * Convert amount between currencies using provided exchange rates
 * Rates are stored as 1 USD = X target units
 * Uses division to convert from source to target
 */
export function convertAmount(
  amount: number,
  fromCurrencyId: number,
  toCurrencyId: number,
  exchangeRates: ExchangeRate[],
  currencies?: Currency[],
): number {
  const rate = getExchangeRate(fromCurrencyId, toCurrencyId, exchangeRates)
  const fromDecimals = getDecimalPlaces(fromCurrencyId, currencies)
  const toDecimals = getDecimalPlaces(toCurrencyId, currencies)
  // Scale amount between smallest units based on decimal places.
  const scale = Math.pow(10, toDecimals) / Math.pow(10, fromDecimals)
  return Math.round(amount * rate * scale)
}

function getDecimalPlaces(currencyId: number, currencies?: Currency[]): number {
  if (!currencies || currencies.length === 0) return 2
  const found = currencies.find((currency) => currency.id === currencyId)
  return found?.decimalPlaces ?? 2
}
