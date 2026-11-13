/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type { AdminRatesSnapshot } from "@domain/money"
import { createAdminRatesRoutes } from "./rates.ts"

const SNAPSHOT: AdminRatesSnapshot = {
  lastRun: { at: `2026-11-06T16:02:00.000Z`, failed: false },
  fetches: [{ source: `frankfurter:ECB`, fetchedAt: `2026-11-06T16:02:00.000Z`, count: 30 }],
  missing: { date: `2026-11-06`, currencies: [`VND`] },
  fallback: { used: 412, cap: 1000, resetsOn: `2026-12-01` },
  days: [{
    date: `2026-11-06`,
    rows: [{ source: `frankfurter:ECB`, currencies: 30, fetchedAt: `2026-11-06T16:02:00.000Z` }],
  }],
  coins: {
    prices: [{
      coin: `BTC`,
      price: `69608.45`,
      date: `2026-11-06`,
      fetchedAt: `2026-11-06T16:01:00.000Z`,
    }],
    unpriced: [`ETH`],
    calls: { used: 6, cap: 10_000, resetsOn: `2026-12-01` },
  },
}

Deno.test("the exchange rates route answers the page's snapshot after the rate limit", async () => {
  const steps: string[] = []
  const app = createAdminRatesRoutes({
    limit: async (_c, next) => (steps.push(`limit`), await next()),
    read: () => (steps.push(`read`), Promise.resolve(SNAPSHOT)),
  })
  const response = await app.request(`/rates`)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(SNAPSHOT)
  expect(steps).toEqual([`limit`, `read`])
})
