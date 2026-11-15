/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { createDevRoute, type DevRouteDeps } from "./dev.ts"

/** The development route with the free plan answer and `isDev` given; nothing else is reached. */
function devRoute(freePlanAllowsNothing: boolean, isDev = true) {
  return createDevRoute({
    isDev,
    db: {} as DevRouteDeps["db"],
    sql: {} as DevRouteDeps["sql"],
    closeSockets: () => 0,
    forgetCodeBudget: () => Promise.resolve(),
    freePlanAllowsNothing,
  })
}

Deno.test("the free plan route tells the e2e specs whether the free plan allows nothing", async () => {
  for (const allowsNothing of [true, false]) {
    const response = await devRoute(allowsNothing).request("/free-plan")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ allowsNothing })
  }
})

Deno.test("the free plan route refuses outside development", async () => {
  const response = await devRoute(true, false).request("/free-plan")
  expect(response.status).toBe(403)
})

/** The development route with a fake client that records each statement's values, and a post. */
function coinPriceRoute(isDev = true) {
  const statements: unknown[][] = []
  const sql = (_strings: TemplateStringsArray, ...values: unknown[]) => {
    statements.push(values)
    return Promise.resolve([])
  }
  const route = createDevRoute({
    isDev,
    db: {} as DevRouteDeps["db"],
    sql: sql as unknown as DevRouteDeps["sql"],
    closeSockets: () => 0,
    forgetCodeBudget: () => Promise.resolve(),
    freePlanAllowsNothing: false,
  })
  const post = (body: unknown) =>
    route.request("/coin-price", {
      method: `POST`,
      headers: { "content-type": `application/json` },
      body: JSON.stringify(body),
    })
  return { statements, post }
}

Deno.test("the coin price route stores a listed coin's euro price for its day", async () => {
  const { statements, post } = coinPriceRoute()
  const response = await post({ coin: `BTC`, price: `60000`, date: `2026-11-15` })
  expect(response.status).toBe(200)
  expect(statements).toHaveLength(1)
  expect(statements[0].slice(0, 3)).toEqual([`BTC`, `60000`, `2026-11-15`])
})

Deno.test("the coin price route refuses a coin not listed, a price not a positive decimal and a date the calendar lacks", async () => {
  const { statements, post } = coinPriceRoute()
  for (
    const body of [
      { coin: `DOGE`, price: `1`, date: `2026-11-15` },
      { coin: `BTC`, price: `-1`, date: `2026-11-15` },
      { coin: `BTC`, price: `0.00`, date: `2026-11-15` },
      { coin: `BTC`, price: `1`, date: `2026-02-30` },
    ]
  ) {
    expect((await post(body)).status).toBe(400)
  }
  expect(statements).toEqual([])
})

Deno.test("the coin price route refuses outside development and stores nothing", async () => {
  const { statements, post } = coinPriceRoute(false)
  expect((await post({ coin: `BTC`, price: `60000`, date: `2026-11-15` })).status).toBe(403)
  expect(statements).toEqual([])
})
