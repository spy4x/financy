import { describe, expect, it } from "@shared/testing"
import {
  convertAmount as convertOld,
  getExchangeRate as _getRateOld,
} from "@shared/helpers/currency.ts"
import {
  convertAmount as convertNew,
  getExchangeRate as _getRateNew,
} from "@shared/helpers/currency-converter.ts"
import type { ExchangeRate, Currency } from "@shared/types"

// Mock rates matching realistic example
const rates: ExchangeRate[] = [
  {
    id: 3001,
    fromCurrencyId: 1, // USD
    toCurrencyId: 4, // JPY
    rate: 155.5954,
    date: "2026-01-01T00:00:00.000Z",
    fetchedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 3002,
    fromCurrencyId: 1, // USD
    toCurrencyId: 5, // GBP
    rate: 0.7924,
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
  {
    id: 5,
    code: "GBP",
    name: "GBP",
    type: "fiat",
    decimalPlaces: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
]

describe("AccountTransfer logic (conversion checks)", () => {
  it("same-currency transfer leaves amount unchanged", () => {
    const amount = 12345 // cents
    // No conversion expected
    const convertedOld = convertOld(amount, 1, 1, rates, currencies as unknown as Currency[])
    const convertedNew = convertNew(amount, 1, 1, rates, currencies as unknown as Currency[])
    expect(convertedOld).toBe(convertedNew)
    expect(convertedNew).toBe(amount)
  })

  it("USD -> JPY transfer should produce same converted amount (old VS new)", () => {
    const amount = 10000 // $100.00 in cents

    const convertedByHandler = convertOld(amount, 1, 4, rates, currencies as unknown as Currency[])
    const expected = convertNew(amount, 1, 4, rates, currencies as unknown as Currency[])

    // We assert they should match (this will fail until old helper is fixed)
    expect(convertedByHandler).toBe(expected)
  })

  it("JPY -> USD transfer (inverse) should match expected cents", () => {
    const amount = 15560 // JPY
    const convertedByHandler = convertOld(amount, 4, 1, rates, currencies as unknown as Currency[])
    const expected = convertNew(amount, 4, 1, rates, currencies as unknown as Currency[])

    // Expect equality (documents current mismatch)
    expect(convertedByHandler).toBe(expected)
  })

  it("verify transaction scaling: USD cents -> JPY units stored as integers", () => {
    // This test documents that transfer handler must store destination amount in
    // destination smallest units. We compute expected using decimal-aware converter
    const amount = 2500 // $25.00
    const expected = convertNew(amount, 1, 4, rates, currencies as unknown as Currency[])

    const old = convertOld(amount, 1, 4, rates, currencies as unknown as Currency[])
    expect(old).toBe(expected)
  })
})
