import { describe, expect, it } from "@shared/testing"
import { TransactionDirection } from "@shared/types"
import {
  applyCurrencySign,
  formatCentsToInput,
  formatCurrency,
  formatMoney,
  parseCurrencyInput,
} from "./format.ts"

describe("Currency formatting helpers", () => {
  it("formatCentsToInput", () => {
    expect(formatCentsToInput(1234)).toBe("12.34")
    expect(formatCentsToInput(-1234)).toBe("12.34") // Always positive
    expect(formatCentsToInput(100)).toBe("1.00")
    expect(formatCentsToInput(0)).toBe("0.00")
  })

  it("parseCurrencyInput", () => {
    expect(parseCurrencyInput("12.34")).toBe(1234)
    expect(parseCurrencyInput("12")).toBe(1200)
    expect(parseCurrencyInput("0")).toBe(0)
    expect(parseCurrencyInput("")).toBe(null)
    expect(parseCurrencyInput("invalid")).toBe(null)
    expect(parseCurrencyInput("-5")).toBe(null) // Negative not allowed
  })

  it("applyCurrencySign", () => {
    expect(applyCurrencySign(1234, TransactionDirection.MONEY_OUT)).toBe(-1234) // MONEY_OUT = negative
    expect(applyCurrencySign(1234, TransactionDirection.MONEY_IN)).toBe(1234) // MONEY_IN = positive
    expect(applyCurrencySign(-1234, TransactionDirection.MONEY_OUT)).toBe(-1234) // Always applies correct sign
    expect(applyCurrencySign(-1234, TransactionDirection.MONEY_IN)).toBe(1234) // Always applies correct sign

    // Test edge cases
    expect(applyCurrencySign(0, TransactionDirection.MONEY_OUT)).toBe(0) // Zero amount
    expect(applyCurrencySign(0, TransactionDirection.MONEY_IN)).toBe(0) // Zero amount
  })

  it("formatCurrency", () => {
    const result = formatCurrency(1234, "USD")
    expect(result.amount).toBe("12.34")
    expect(result.symbol).toBe("$")
  })

  it("formatMoney", () => {
    const result = formatMoney(1234, "USD")
    expect(result).toBe("$12.34")
  })
})

describe("parseCurrencyInput with different decimal places", () => {
  it("should parse USD amount with 2 decimals correctly", () => {
    expect(parseCurrencyInput("5000.00", 2)).toBe(500000) // $5000 = 500000 cents
    expect(parseCurrencyInput("0.01", 2)).toBe(1) // 1 cent
  })
  
  it("should parse JPY amount with 0 decimals correctly", () => {
    expect(parseCurrencyInput("10000", 0)).toBe(10000) // ¥10000 = 10000 yen
    expect(parseCurrencyInput("100000", 0)).toBe(100000) // ¥100000 = 100000 yen
  })
  
  it("should parse BTC amount with 8 decimals correctly", () => {
    expect(parseCurrencyInput("0.00000001", 8)).toBe(1) // 1 satoshi
    expect(parseCurrencyInput("1.00000000", 8)).toBe(100000000) // 1 BTC
  })
  
  it("should parse BHD amount with 3 decimals correctly", () => {
    expect(parseCurrencyInput("1000.000", 3)).toBe(1000000) // 1000 BHD
  })
})

describe("formatCentsToInput with different decimal places", () => {
  it("should format USD cents with 2 decimals correctly", () => {
    expect(formatCentsToInput(500000, 2)).toBe("5000.00")
    expect(formatCentsToInput(1, 2)).toBe("0.01")
  })
  
  it("should format JPY amount with 0 decimals correctly", () => {
    expect(formatCentsToInput(10000, 0)).toBe("10000")
    expect(formatCentsToInput(100000, 0)).toBe("100000")
  })
  
  it("should format BTC satoshis with 8 decimals correctly", () => {
    expect(formatCentsToInput(1, 8)).toBe("0.00000001")
    expect(formatCentsToInput(100000000, 8)).toBe("1.00000000")
  })
  
  it("should format BHD fils with 3 decimals correctly", () => {
    expect(formatCentsToInput(1000000, 3)).toBe("1000.000")
  })
})

describe("round-trip conversion", () => {
  it("should preserve value for USD (2 decimals)", () => {
    const original = "5000.00"
    const cents = parseCurrencyInput(original, 2)
    const formatted = formatCentsToInput(cents!, 2)
    expect(formatted).toBe(original)
  })
  
  it("should preserve value for JPY (0 decimals)", () => {
    const original = "100000"
    const amount = parseCurrencyInput(original, 0)
    const formatted = formatCentsToInput(amount!, 0)
    expect(formatted).toBe(original)
  })
})
