import { computed, signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Currency, WebSocketMessageType } from "@shared/types"

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
   * Find currency by ID
   */
  findById(currencyId: number): Currency | undefined {
    return list.value.find((c) => c.id === currencyId)
  },
  /**
   * Find currency by code
   */
  findByCode(code: string): Currency | undefined {
    return list.value.find((c) => c.code === code)
  },
  /**
   * Get currency with fallback
   */
  getDisplay(currencyId: number): Currency {
    const found = currency.findById(currencyId)
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
    const found = currency.findByCode(code)
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
  /**
   * Format currency amount
   */
  format(amount: number, currencyOrId: Currency | number): string {
    const curr = typeof currencyOrId === "number" ? currency.getDisplay(currencyOrId) : currencyOrId

    const divisor = Math.pow(10, curr.decimalPlaces)
    const value = amount / divisor

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr.code,
      minimumFractionDigits: curr.decimalPlaces,
      maximumFractionDigits: curr.decimalPlaces,
    }).format(value)
  },
  /**
   * Convert to smallest unit
   */
  toSmallestUnit(amount: number, currencyOrId: Currency | number): number {
    const curr = typeof currencyOrId === "number" ? currency.getDisplay(currencyOrId) : currencyOrId

    const multiplier = Math.pow(10, curr.decimalPlaces)
    return Math.round(amount * multiplier)
  },
  /**
   * Convert from smallest unit
   */
  fromSmallestUnit(amount: number, currencyOrId: Currency | number): number {
    const curr = typeof currencyOrId === "number" ? currency.getDisplay(currencyOrId) : currencyOrId

    const divisor = Math.pow(10, curr.decimalPlaces)
    return amount / divisor
  },
}
