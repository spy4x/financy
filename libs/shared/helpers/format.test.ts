import { describe, expect, it } from "@shared/testing"
import { TransactionType } from "@shared/types"
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
    expect(applyCurrencySign(1234, TransactionType.DEBIT)).toBe(-1234) // DEBIT = negative
    expect(applyCurrencySign(1234, TransactionType.CREDIT)).toBe(1234) // CREDIT = positive
    expect(applyCurrencySign(-1234, TransactionType.DEBIT)).toBe(-1234) // Always applies correct sign
    expect(applyCurrencySign(-1234, TransactionType.CREDIT)).toBe(1234) // Always applies correct sign

    // Test edge cases
    expect(applyCurrencySign(0, TransactionType.DEBIT)).toBe(0) // Zero amount
    expect(applyCurrencySign(0, TransactionType.CREDIT)).toBe(0) // Zero amount
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
