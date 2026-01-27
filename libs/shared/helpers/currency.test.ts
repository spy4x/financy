import { describe, expect, it } from "@shared/testing"
import type { ExchangeRate, Currency } from "@shared/types"
import { convertAmount, getExchangeRate } from "./currency.ts"

const rates: ExchangeRate[] = [
  {
    id: 2001,
    fromCurrencyId: 1, // USD
    toCurrencyId: 4, // JPY
    rate: 155.5954,
    date: "2026-01-01T00:00:00.000Z",
    fetchedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
]

const currencies = [
  {
    id: 1,
    code: "USD",
    name: "USD",
    type: "fiat",
    decimalPlaces: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 4,
    code: "JPY",
    name: "JPY",
    type: "fiat",
    decimalPlaces: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
]

describe("Currency helper (decimal-aware)", () => {
  it("getExchangeRate - USD -> JPY returns direct rate", () => {
    const r = getExchangeRate(1, 4, rates)
    expect(r).toBe(155.5954)
  })

  it("convertAmount - USD -> JPY (decimal scaling)", () => {
    // $100.00 stored as 10000
    const converted = convertAmount(10000, 1, 4, rates, currencies as unknown as Currency[])
    expect(converted).toBe(15560)
  })

  it("convertAmount - tiny amounts use rounding", () => {
    // 1 cent -> expected 2 JPY (see decimal-aware behaviour)
    const converted = convertAmount(1, 1, 4, rates, currencies as unknown as Currency[])
    expect(converted).toBe(2)
  })
})
