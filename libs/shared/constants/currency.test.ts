import { describe, expect, it } from "@shared/testing"
import {
  findCurrencyByCode,
  findCurrencyById,
  formatCurrency,
  fromSmallestUnit,
  getCurrenciesByType,
  searchCurrencies,
  toSmallestUnit,
} from "./currency.ts"
import { CurrencyType } from "@shared/types"

describe("Currency helper functions", () => {
  // Mock currencies for testing
  const mockCurrencies = [
    {
      id: 1,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      type: CurrencyType.FIAT,
      decimalPlaces: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      id: 2,
      code: "EUR",
      name: "Euro",
      symbol: "€",
      type: CurrencyType.FIAT,
      decimalPlaces: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      id: 3,
      code: "BTC",
      name: "Bitcoin",
      symbol: "₿",
      type: CurrencyType.CRYPTO,
      decimalPlaces: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    {
      id: 4,
      code: "JPY",
      name: "Japanese Yen",
      symbol: "¥",
      type: CurrencyType.FIAT,
      decimalPlaces: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
  ]

  describe("searchCurrencies", () => {
    it("should search by currency code", () => {
      const result = searchCurrencies(mockCurrencies, "USD")
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe("USD")
    })

    it("should search by currency name", () => {
      const result = searchCurrencies(mockCurrencies, "bitcoin")
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Bitcoin")
    })

    it("should be case insensitive", () => {
      const result = searchCurrencies(mockCurrencies, "eur")
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe("EUR")
    })

    it("should filter by type", () => {
      const fiatResult = searchCurrencies(mockCurrencies, "", CurrencyType.FIAT)
      expect(fiatResult).toHaveLength(3)
      expect(fiatResult.every((c) => c.type === CurrencyType.FIAT)).toBe(true)

      const cryptoResult = searchCurrencies(mockCurrencies, "", CurrencyType.CRYPTO)
      expect(cryptoResult).toHaveLength(1)
      expect(cryptoResult[0].code).toBe("BTC")
    })

    it("should combine search and type filter", () => {
      const result = searchCurrencies(mockCurrencies, "dollar", CurrencyType.FIAT)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe("USD")
    })

    it("should return empty array for no matches", () => {
      const result = searchCurrencies(mockCurrencies, "XYZ")
      expect(result).toHaveLength(0)
    })

    it("should return all currencies for empty search", () => {
      const result = searchCurrencies(mockCurrencies, "")
      expect(result).toHaveLength(4)
    })
  })

  describe("toSmallestUnit", () => {
    it("should convert USD amount to cents", () => {
      const usd = mockCurrencies[0]
      expect(toSmallestUnit(12.34, usd)).toBe(1234)
      expect(toSmallestUnit(100, usd)).toBe(10000)
      expect(toSmallestUnit(0.01, usd)).toBe(1)
    })

    it("should handle JPY (no decimals)", () => {
      const jpy = mockCurrencies[3]
      expect(toSmallestUnit(123, jpy)).toBe(123)
      expect(toSmallestUnit(123.45, jpy)).toBe(123) // Should round
    })

    it("should handle Bitcoin (8 decimals)", () => {
      const btc = mockCurrencies[2]
      expect(toSmallestUnit(1, btc)).toBe(100000000) // 1 BTC = 100,000,000 satoshis
      expect(toSmallestUnit(0.00000001, btc)).toBe(1) // 1 satoshi
    })

    it("should handle rounding", () => {
      const usd = mockCurrencies[0]
      expect(toSmallestUnit(12.345, usd)).toBe(1235) // Rounds to nearest cent
      expect(toSmallestUnit(12.344, usd)).toBe(1234)
    })
  })

  describe("fromSmallestUnit", () => {
    it("should convert cents to USD amount", () => {
      const usd = mockCurrencies[0]
      expect(fromSmallestUnit(1234, usd)).toBe(12.34)
      expect(fromSmallestUnit(10000, usd)).toBe(100)
      expect(fromSmallestUnit(1, usd)).toBe(0.01)
    })

    it("should handle JPY (no decimals)", () => {
      const jpy = mockCurrencies[3]
      expect(fromSmallestUnit(123, jpy)).toBe(123)
    })

    it("should handle Bitcoin (8 decimals)", () => {
      const btc = mockCurrencies[2]
      expect(fromSmallestUnit(100000000, btc)).toBe(1) // 100,000,000 satoshis = 1 BTC
      expect(fromSmallestUnit(1, btc)).toBe(0.00000001) // 1 satoshi
    })
  })

  describe("getCurrenciesByType", () => {
    it("should filter by FIAT type", () => {
      const result = getCurrenciesByType(mockCurrencies, CurrencyType.FIAT)
      expect(result).toHaveLength(3)
      expect(result.every((c) => c.type === CurrencyType.FIAT)).toBe(true)
    })

    it("should filter by CRYPTO type", () => {
      const result = getCurrenciesByType(mockCurrencies, CurrencyType.CRYPTO)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe("BTC")
    })

    it("should return all currencies when no filter", () => {
      const result = getCurrenciesByType(mockCurrencies)
      expect(result).toHaveLength(4)
    })
  })

  describe("findCurrencyByCode", () => {
    it("should find currency by exact code", () => {
      const result = findCurrencyByCode(mockCurrencies, "USD")
      expect(result?.code).toBe("USD")
    })

    it("should be case insensitive", () => {
      const result = findCurrencyByCode(mockCurrencies, "usd")
      expect(result?.code).toBe("USD")
    })

    it("should return undefined for non-existent code", () => {
      const result = findCurrencyByCode(mockCurrencies, "XYZ")
      expect(result).toBeUndefined()
    })
  })

  describe("findCurrencyById", () => {
    it("should find currency by ID", () => {
      const result = findCurrencyById(mockCurrencies, 1)
      expect(result?.code).toBe("USD")
    })

    it("should return undefined for non-existent ID", () => {
      const result = findCurrencyById(mockCurrencies, 999)
      expect(result).toBeUndefined()
    })
  })

  describe("formatCurrency", () => {
    it("should format USD correctly", () => {
      const usd = mockCurrencies[0]
      const result = formatCurrency(1234, usd) // $12.34
      expect(result).toMatch(/12\.34/) // Should contain the amount
      expect(result).toMatch(/\$|USD/) // Should contain $ or USD
    })

    it("should format JPY correctly (no decimals)", () => {
      const jpy = mockCurrencies[3]
      const result = formatCurrency(123, jpy) // ¥123
      expect(result).toMatch(/123/)
      expect(result).toMatch(/¥|JPY/)
    })

    it("should handle zero amounts", () => {
      const usd = mockCurrencies[0]
      const result = formatCurrency(0, usd)
      expect(result).toMatch(/0\.00/)
    })

    it("should handle large amounts", () => {
      const usd = mockCurrencies[0]
      const result = formatCurrency(123456789, usd) // $1,234,567.89
      expect(result).toMatch(/1,234,567\.89/)
    })
  })
})
