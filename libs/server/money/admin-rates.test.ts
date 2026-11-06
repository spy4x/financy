/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { readAdminFallbackCap } from "./admin-rates.ts"

const env = (cap?: string) => ({
  get: (name: string) => name === `RATES_FALLBACK_MONTHLY_CAP` ? cap : undefined,
})

Deno.test("the admin page reads the fallback as off while its cap is empty", () => {
  expect(readAdminFallbackCap(env())).toBeNull()
  expect(readAdminFallbackCap(env(`  `))).toBeNull()
})

Deno.test("the admin page reads the fallback's cap as a whole number, and refuses anything else", () => {
  expect(readAdminFallbackCap(env(`500`))).toBe(500)
  expect(readAdminFallbackCap(env(`0`))).toBe(0)
  expect(() => readAdminFallbackCap(env(`ten`))).toThrow(`RATES_FALLBACK_MONTHLY_CAP`)
  expect(() => readAdminFallbackCap(env(`-1`))).toThrow(`RATES_FALLBACK_MONTHLY_CAP`)
})
