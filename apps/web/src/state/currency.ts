import { computed, signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Currency, WebSocketMessageType } from "@shared/types"
import { findCurrencyByCode, findCurrencyById } from "@shared/constants/currency.ts"

const list = signal<Currency[]>([])

const fiatCurrencies = computed(() => list.value.filter((currency) => currency.type === 1))

const cryptoCurrencies = computed(() => list.value.filter((currency) => currency.type === 2))

export const currency = {
  list,
  fiatCurrencies,
  cryptoCurrencies,
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "currency") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          currency.list.value = Array.isArray(msg.p) ? (msg.p as Currency[]) : []
          break
      }
    })
  },
  /**
   * Get currency with fallback
   */
  getById(currencyId: number): Currency {
    const found = findCurrencyById(currency.list.value, currencyId)
    if (found) return found

    // Fallback currency
    return {
      id: currencyId,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      type: 1,
      decimalPlaces: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }
  },
  /**
   * Get currency by code with fallback
   */
  getByCode(code: string): Currency {
    const found = findCurrencyByCode(currency.list.value, code)
    if (found) return found

    // Fallback currency
    return {
      id: 0,
      code: code.toUpperCase(),
      name: code.toUpperCase(),
      symbol: undefined,
      type: 1,
      decimalPlaces: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }
  },
}
