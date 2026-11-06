import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { readFallbackCap, readRatesSetup } from "./rates-setup.ts"

function env(values: Record<string, string>) {
  return { get: (name: string) => values[name] }
}

const KEY = "testkey12345"

describe("reading the rate sources from the environment", () => {
  it("leaves the fallback off without its key, whatever the cap", () => {
    expect(readFallbackCap(env({ RATES_FALLBACK_MONTHLY_CAP: "100" }))).toBeNull()
    expect(readRatesSetup(env({})).fallback).toBeNull()
  })

  it("throws when the key is set and the cap is missing, and names no value", () => {
    expect(() => readFallbackCap(env({ RATES_FALLBACK_KEY: KEY }))).toThrow(
      "RATES_FALLBACK_MONTHLY_CAP must be a whole number from 0 to 1000000 when RATES_FALLBACK_KEY is set",
    )
    try {
      readRatesSetup(env({ RATES_FALLBACK_KEY: KEY }))
    } catch (error) {
      expect(String(error)).not.toContain(KEY)
    }
  })

  it("throws on a cap that is not a whole number from 0 to 1,000,000", () => {
    for (const cap of ["", "-1", "1.5", "1e3", "1000001", "ten"]) {
      expect(() =>
        readFallbackCap(env({ RATES_FALLBACK_KEY: KEY, RATES_FALLBACK_MONTHLY_CAP: cap }))
      )
        .toThrow("RATES_FALLBACK_MONTHLY_CAP")
    }
  })

  it("turns the fallback on with its key and cap", () => {
    const setup = readRatesSetup(env({ RATES_FALLBACK_KEY: KEY, RATES_FALLBACK_MONTHLY_CAP: "30" }))
    expect(setup.fallback?.monthlyCap).toBe(30)
    expect(setup.fallback?.source.id).toBe("exchangerate-api")
    expect(setup.ecb.id).toBe("frankfurter:ECB")
  })

  it("refuses a Frankfurter address that is not http or https", () => {
    expect(() => readRatesSetup(env({ RATES_FRANKFURTER_URL: "ftp://rates.example.com" }))).toThrow(
      "RATES_FRANKFURTER_URL is not an http or https address",
    )
  })
})
