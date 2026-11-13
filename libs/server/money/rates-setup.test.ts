import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { readCoinSource, readFallbackCap, readRatesSetup } from "./rates-setup.ts"

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

  it("leaves coin prices off without the CoinGecko key, whatever the plan", () => {
    expect(readCoinSource(env({ RATES_COINGECKO_PLAN: "pro" }))).toBeNull()
    expect(readCoinSource(env({ RATES_COINGECKO_KEY: "  " }))).toBeNull()
    expect(readRatesSetup(env({})).coins).toBeNull()
  })

  it("turns coin prices on with the key, on the Demo plan by default", async () => {
    const asked: { url: string; headers: Headers }[] = []
    const fetch: typeof globalThis.fetch = (input, init) => {
      asked.push({ url: String(input), headers: new Headers(init?.headers) })
      return Promise.resolve(new Response(`{}`, { status: 404 }))
    }
    const setup = readRatesSetup(env({ RATES_COINGECKO_KEY: KEY }), fetch)
    expect(setup.coins?.id).toBe("coingecko")
    await setup.coins!.daily("2026-11-12", "ETH", ["EUR"])
    expect(asked[0].url).toContain("https://api.coingecko.com/api/v3/coins/ethereum/history")
    expect(asked[0].headers.get("x-cg-demo-api-key")).toBe(KEY)
  })

  it("asks the Pro host with the pro plan", async () => {
    const asked: string[] = []
    const fetch: typeof globalThis.fetch = (input) => {
      asked.push(String(input))
      return Promise.resolve(new Response(`{}`, { status: 404 }))
    }
    const coins = readCoinSource(
      env({ RATES_COINGECKO_KEY: KEY, RATES_COINGECKO_PLAN: "pro" }),
      fetch,
    )
    await coins!.daily("2026-11-12", "BTC", ["EUR"])
    expect(asked[0]).toContain("https://pro-api.coingecko.com/api/v3/coins/bitcoin/history")
  })

  it("throws on a plan that is not demo or pro, and names no value", () => {
    expect(() => readCoinSource(env({ RATES_COINGECKO_KEY: KEY, RATES_COINGECKO_PLAN: "free" })))
      .toThrow("RATES_COINGECKO_PLAN must be demo or pro")
  })

  it("throws on a key with a space or a control character, and names no value", () => {
    for (const key of ["two words", "tab\there"]) {
      let message = ""
      try {
        readRatesSetup(env({ RATES_COINGECKO_KEY: key }))
      } catch (error) {
        message = String(error)
      }
      expect(message).toContain("RATES_COINGECKO_KEY must be printable ASCII without spaces")
      expect(message).not.toContain(key)
    }
  })
})
