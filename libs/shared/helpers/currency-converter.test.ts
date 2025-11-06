import { describe, expect, it } from "@shared/testing"
import type { ExchangeRate } from "@shared/types"
import { convertAmount, getExchangeRate, getRatesForCurrency } from "./currency-converter.ts"

// Mock exchange rates (all using USD as base currency, like in production)
const mockRates: ExchangeRate[] = [
  {
    id: 1,
    fromCurrencyId: 1, // USD
    toCurrencyId: 2, // EUR
    rate: 0.85,
    date: "2025-11-06T00:00:00.000Z",
    fetchedAt: new Date("2025-11-06T12:00:00.000Z"),
    createdAt: new Date("2025-11-06T12:00:00.000Z"),
    updatedAt: new Date("2025-11-06T12:00:00.000Z"),
    deletedAt: null,
  },
  {
    id: 2,
    fromCurrencyId: 1, // USD
    toCurrencyId: 11, // SGD
    rate: 1.35,
    date: "2025-11-06T00:00:00.000Z",
    fetchedAt: new Date("2025-11-06T12:00:00.000Z"),
    createdAt: new Date("2025-11-06T12:00:00.000Z"),
    updatedAt: new Date("2025-11-06T12:00:00.000Z"),
    deletedAt: null,
  },
  {
    id: 3,
    fromCurrencyId: 1, // USD
    toCurrencyId: 90, // RUB
    rate: 80.0,
    date: "2025-11-06T00:00:00.000Z",
    fetchedAt: new Date("2025-11-06T12:00:00.000Z"),
    createdAt: new Date("2025-11-06T12:00:00.000Z"),
    updatedAt: new Date("2025-11-06T12:00:00.000Z"),
    deletedAt: null,
  },
  {
    id: 4,
    fromCurrencyId: 1, // USD
    toCurrencyId: 4, // JPY
    rate: 150.0,
    date: "2025-11-06T00:00:00.000Z",
    fetchedAt: new Date("2025-11-06T12:00:00.000Z"),
    createdAt: new Date("2025-11-06T12:00:00.000Z"),
    updatedAt: new Date("2025-11-06T12:00:00.000Z"),
    deletedAt: null,
  },
  // Older rate for EUR (should be ignored in favor of newer one)
  {
    id: 5,
    fromCurrencyId: 1, // USD
    toCurrencyId: 2, // EUR
    rate: 0.90,
    date: "2025-11-05T00:00:00.000Z",
    fetchedAt: new Date("2025-11-05T12:00:00.000Z"),
    createdAt: new Date("2025-11-05T12:00:00.000Z"),
    updatedAt: new Date("2025-11-05T12:00:00.000Z"),
    deletedAt: null,
  },
]

describe("Currency Converter", () => {
  it("getExchangeRate - same currency returns 1:1", () => {
    const result = getExchangeRate(1, 1, mockRates)
    expect(result?.rate).toBe(1)
    expect(result?.isSynthetic).toBe(false)
    expect(result?.path).toBe("same_currency")
  })

  it("getExchangeRate - direct rate from USD", () => {
    const result = getExchangeRate(1, 2, mockRates) // USD → EUR
    expect(result?.rate).toBe(0.85) // Latest rate, not 0.90
    expect(result?.isSynthetic).toBe(false)
    expect(result?.path).toBe("1→2")
  })

  it("getExchangeRate - inverse rate to USD", () => {
    const result = getExchangeRate(2, 1, mockRates) // EUR → USD
    expect(result?.rate).toBe(1 / 0.85) // Inverse of USD → EUR
    expect(result?.isSynthetic).toBe(false)
    expect(result?.path).toBe("2←1 (inverse)")
  })

  it("getExchangeRate - cross-rate through USD (SGD → RUB)", () => {
    const result = getExchangeRate(11, 90, mockRates) // SGD → RUB

    // SGD → USD: 1 / 1.35 = 0.74074...
    // USD → RUB: 80.0
    // SGD → RUB: 0.74074... × 80.0 = 59.259...

    expect(result?.isSynthetic).toBe(true)
    expect(result?.path).toBe("11→1→90")
    expect(Math.round(result!.rate * 100) / 100).toBe(59.26) // Round to 2 decimals for comparison
  })

  it("getExchangeRate - cross-rate through USD (RUB → SGD)", () => {
    const result = getExchangeRate(90, 11, mockRates) // RUB → SGD

    // RUB → USD: 1 / 80.0 = 0.0125
    // USD → SGD: 1.35
    // RUB → SGD: 0.0125 × 1.35 = 0.016875

    expect(result?.isSynthetic).toBe(true)
    expect(result?.path).toBe("90→1→11")
    expect(Math.round(result!.rate * 1000000) / 1000000).toBe(0.016875)
  })

  it("getExchangeRate - cross-rate through USD (EUR → SGD)", () => {
    const result = getExchangeRate(2, 11, mockRates) // EUR → SGD

    // EUR → USD: 1 / 0.85 = 1.17647...
    // USD → SGD: 1.35
    // EUR → SGD: 1.17647... × 1.35 = 1.5882...

    expect(result?.isSynthetic).toBe(true)
    expect(result?.path).toBe("2→1→11")
    expect(Math.round(result!.rate * 100) / 100).toBe(1.59) // Round to 2 decimals
  })

  it("getExchangeRate - no path available returns null", () => {
    const result = getExchangeRate(99, 100, mockRates) // Non-existent currencies
    expect(result).toBe(null)
  })

  it("getRatesForCurrency - USD base currency", () => {
    const ratesMap = getRatesForCurrency(1, mockRates) // USD as base

    expect(ratesMap.size).toBe(4) // EUR, SGD, RUB, JPY
    expect(ratesMap.get(2)?.rate).toBe(0.85) // USD → EUR
    expect(ratesMap.get(11)?.rate).toBe(1.35) // USD → SGD
    expect(ratesMap.get(90)?.rate).toBe(80.0) // USD → RUB
    expect(ratesMap.get(4)?.rate).toBe(150.0) // USD → JPY
  })

  it("getRatesForCurrency - SGD base currency (requires cross-rates)", () => {
    const ratesMap = getRatesForCurrency(11, mockRates) // SGD as base

    expect(ratesMap.size).toBe(4) // USD, EUR, RUB, JPY

    // SGD → USD (inverse of USD → SGD)
    const usdRate = ratesMap.get(1)?.rate
    expect(Math.round(usdRate! * 1000) / 1000).toBe(Math.round((1 / 1.35) * 1000) / 1000)

    // SGD → EUR (SGD → USD → EUR)
    const eurRate = ratesMap.get(2)?.rate
    expect(Math.round(eurRate! * 1000) / 1000).toBe(Math.round((1 / 1.35) * 0.85 * 1000) / 1000)

    // SGD → RUB (SGD → USD → RUB)
    const rubRate = ratesMap.get(90)?.rate
    expect(Math.round(rubRate! * 100) / 100).toBe(Math.round((1 / 1.35) * 80.0 * 100) / 100)
  })

  it("convertAmount - USD to EUR", () => {
    const result = convertAmount(10000, 1, 2, mockRates) // $100.00 USD → EUR
    expect(result).toBe(8500) // €85.00
  })

  it("convertAmount - SGD to RUB (cross-rate)", () => {
    const result = convertAmount(10000, 11, 90, mockRates) // $100.00 SGD → RUB
    // SGD → USD → RUB: (10000 / 1.35) × 80.0 = 592592.59...
    expect(result).toBe(592593) // Rounded
  })

  it("convertAmount - same currency returns same amount", () => {
    const result = convertAmount(10000, 1, 1, mockRates)
    expect(result).toBe(10000)
  })

  it("convertAmount - no conversion path returns null", () => {
    const result = convertAmount(10000, 99, 100, mockRates)
    expect(result).toBe(null)
  })

  it("getExchangeRate - ignores deleted rates", () => {
    const ratesWithDeleted: ExchangeRate[] = [
      ...mockRates,
      {
        id: 99,
        fromCurrencyId: 1,
        toCurrencyId: 999,
        rate: 123.45,
        date: "2025-11-06T00:00:00.000Z",
        fetchedAt: new Date("2025-11-06T12:00:00.000Z"),
        createdAt: new Date("2025-11-06T12:00:00.000Z"),
        updatedAt: new Date("2025-11-06T12:00:00.000Z"),
        deletedAt: new Date("2025-11-06T13:00:00.000Z"), // Deleted
      },
    ]

    const result = getExchangeRate(1, 999, ratesWithDeleted)
    expect(result).toBe(null) // Should not find deleted rate
  })
})
