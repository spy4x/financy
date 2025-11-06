import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { ExchangeRate, WebSocketMessageType } from "@shared/types"
import {
  convertAmount,
  getExchangeRate,
  getRatesForCurrency as getRatesForCurrencyConverter,
} from "@shared/helpers/currency-converter.ts"

const list = signal<ExchangeRate[]>([])
const lastFetchedAt = signal<Date | null>(null)

export const exchangeRate = {
  list,
  lastFetchedAt,
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "exchangeRate") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          exchangeRate.list.value = Array.isArray(msg.p) ? (msg.p as ExchangeRate[]) : []
          // Update last fetched timestamp from the most recent rate
          if (exchangeRate.list.value.length > 0) {
            const mostRecent = exchangeRate.list.value.reduce((latest, rate) => {
              return new Date(rate.fetchedAt) > new Date(latest.fetchedAt) ? rate : latest
            })
            exchangeRate.lastFetchedAt.value = new Date(mostRecent.fetchedAt)
          }
          break
      }
    })
  },
  /**
   * Get all exchange rates (for use with currency conversion helpers)
   */
  getAll(): ExchangeRate[] {
    return exchangeRate.list.value
  },
  /**
   * Get the latest exchange rate between two currencies.
   * Supports direct rates, inverse rates, and cross-rates through USD.
   *
   * @param fromCurrencyId Source currency ID
   * @param toCurrencyId Target currency ID
   * @returns Exchange rate or null if not found
   */
  getRate(fromCurrencyId: number, toCurrencyId: number): number | null {
    const result = getExchangeRate(fromCurrencyId, toCurrencyId, exchangeRate.list.value)
    return result ? result.rate : null
  },
  /**
   * Get all rates for a given base currency.
   * Supports direct rates, inverse rates, and cross-rates through USD.
   *
   * @param fromCurrencyId Base currency ID
   * @returns Map of currency ID to exchange rate
   */
  getRatesForCurrency(fromCurrencyId: number): Map<number, number> {
    const conversionResults = getRatesForCurrencyConverter(fromCurrencyId, exchangeRate.list.value)
    const ratesMap = new Map<number, number>()

    conversionResults.forEach((result, currencyId) => {
      ratesMap.set(currencyId, result.rate)
    })

    return ratesMap
  },
  /**
   * Convert an amount from one currency to another.
   *
   * @param amount Amount in the source currency (in smallest unit, e.g., cents)
   * @param fromCurrencyId Source currency ID
   * @param toCurrencyId Target currency ID
   * @returns Converted amount in the target currency (in smallest unit), or null if conversion not possible
   */
  convertAmount(amount: number, fromCurrencyId: number, toCurrencyId: number): number | null {
    return convertAmount(amount, fromCurrencyId, toCurrencyId, exchangeRate.list.value)
  },
}
