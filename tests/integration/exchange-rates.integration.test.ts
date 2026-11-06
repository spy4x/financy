/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import { RATE_SOURCES } from "@domain/money"
import { ratesFetchJob, type RatesJobDeps } from "@server/jobs/exchange-rates.ts"
import type { JobHandler } from "@server/jobs/jobs.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { openBackfillRequests, requestBackfillBefore } from "@server/money/rate-backfill.ts"
import { readRatesSetup } from "@server/money/rates-setup.ts"
import { team, withSchema } from "./group-team.ts"
import saturdayEcb from "../../libs/server/money/fixtures/frankfurter-saturday-ecb.json" with {
  type: "json",
}
import ecbLacksVndAed from "../../libs/server/money/fixtures/frankfurter-ecb-lacks-vnd-aed.json" with {
  type: "json",
}
import paidHistory from "../../libs/server/money/fixtures/exchangerate-api-history-eur-2026-10-31.json" with {
  type: "json",
}

/**
 * Exchange rates against a real Postgres built from schema.sql: the lookup's latest-earlier rule
 * and cross rate, the daily job on recorded replies through a fake fetch, the refusal of bad
 * rates, the paid fallback's cap, and the merging of backfill requests. Needs "DB_HOST",
 * "DB_USER", "DB_PASS" and "DB_NAME" (recipe in docs/handoff.md); it fails when they are missing.
 */

/** A Saturday: Frankfurter answers with Friday 2026-10-30. */
const SATURDAY_16H = new Date("2026-10-31T16:00:00Z")

const FIXTURES = {
  "frankfurter-saturday-ecb.json": saturdayEcb,
  "frankfurter-ecb-lacks-vnd-aed.json": ecbLacksVndAed,
  "exchangerate-api-history-eur-2026-10-31.json": paidHistory,
}

/** A recorded reply, as the body the fake fetch sends. Imported, so the test reads no files. */
function fixture(name: keyof typeof FIXTURES): string {
  return JSON.stringify(FIXTURES[name])
}

/** A fetch that answers every call with `body`, and counts the calls to each host. */
function fakeFetch(bodies: Record<string, string>) {
  const calls: Record<string, number> = {}
  const fetch: typeof globalThis.fetch = (input) => {
    const host = new URL(input instanceof Request ? input.url : String(input)).host
    calls[host] = (calls[host] ?? 0) + 1
    const body = bodies[host]
    if (body === undefined) return Promise.resolve(new Response(`{}`, { status: 404 }))
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": `application/json` } }),
    )
  }
  return { fetch, calls }
}

const ECB_HOST = `api.frankfurter.dev`
const PAID_HOST = `v6.exchangerate-api.com`

/** One run of the daily job; it reads no job row, so the event is a stand-in. */
async function fetchOnce(deps: RatesJobDeps): Promise<void> {
  await ratesFetchJob(deps)({} as Parameters<JobHandler>[0])
}

function env(values: Record<string, string>) {
  return { get: (name: string) => values[name] }
}

function rate(quote: string, value: string, date: string, source: string = RATE_SOURCES.ecb) {
  return { base: `EUR`, quote, rate: value, date, source }
}

async function storeRates(sql: postgres.Sql, rates: ExchangeRate[]): Promise<void> {
  await new PostgresRateRepository(sql).insert(rates, new Date(), () => {
    throw new Error(`a test rate was refused`)
  })
}

async function rowCount(sql: postgres.Sql): Promise<number> {
  return (await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM exchange_rates`)[0]
    .count
}

async function chooseCurrency(sql: postgres.Sql, groupId: string, code: string, by: number) {
  await sql`
    INSERT INTO household_settings (group_id, base_currency, updated_by_user_id)
    VALUES (${groupId}, ${code}, ${by})
  `
}

Deno.test("rate lookup: a day's rate, else the latest earlier one with its own date", async () => {
  await withSchema(async (sql) => {
    await storeRates(sql, [
      rate(`USD`, `1.1100`, `2026-10-29`),
      rate(`USD`, `1.1172`, `2026-10-30`),
    ])
    const rates = new PostgresRateRepository(sql)

    expect(await rates.lookup(`EUR`, `USD`, `2026-10-29`)).toEqual({
      found: true,
      rate: rate(`USD`, `1.1100`, `2026-10-29`),
    })
    expect(await rates.lookup(`EUR`, `USD`, `2026-10-31`)).toEqual({
      found: true,
      rate: rate(`USD`, `1.1172`, `2026-10-30`),
    })
    // The other way round is the same stored rate, quoted from the euro, for convertMoney.
    expect(await rates.lookup(`USD`, `EUR`, `2026-10-31`)).toEqual({
      found: true,
      rate: rate(`USD`, `1.1172`, `2026-10-30`),
    })
  })
})

Deno.test("rate lookup: a date before every stored rate has no rate, never 0 or 1", async () => {
  await withSchema(async (sql) => {
    await storeRates(sql, [rate(`USD`, `1.1172`, `2026-10-30`)])
    const rates = new PostgresRateRepository(sql)
    expect(await rates.lookup(`EUR`, `USD`, `2026-10-29`)).toEqual({
      found: false,
      reason: `no-rate`,
    })
    expect(await rates.lookup(`EUR`, `VND`, `2026-10-31`)).toEqual({
      found: false,
      reason: `no-rate`,
    })
    expect(await rates.lookup(`USD`, `JPY`, `2026-10-31`)).toEqual({
      found: false,
      reason: `no-rate`,
    })
  })
})

Deno.test("rate lookup: USD to JPY is a cross rate through the euro, from one source and day", async () => {
  await withSchema(async (sql) => {
    const recorded = saturdayEcb as {
      date: string
      quote: string
      rate: number
    }[]
    await storeRates(sql, recorded.map((row) => rate(row.quote, String(row.rate), row.date)))
    // A newer USD rate from the fallback alone has no JPY leg on its day, so it is not used.
    await storeRates(sql, [rate(`USD`, `1.2000`, `2026-10-31`, RATE_SOURCES.fallback)])

    const found = await new PostgresRateRepository(sql).lookup(`USD`, `JPY`, `2026-10-31`)
    if (!found.found) throw new Error(`no cross rate`)
    expect(found.rate.base).toBe(`USD`)
    expect(found.rate.quote).toBe(`JPY`)
    expect(found.rate.date).toBe(`2026-10-30`)
    expect(found.rate.source).toBe(RATE_SOURCES.ecb)
    expect(Number(found.rate.rate)).toBeCloseTo(175.68 / 1.1172, 6)
  })
})

Deno.test("rate lookup: on a day both sources have, the ECB's rate is taken", async () => {
  await withSchema(async (sql) => {
    await storeRates(sql, [
      rate(`USD`, `1.2000`, `2026-10-30`, RATE_SOURCES.fallback),
      rate(`USD`, `1.1172`, `2026-10-30`),
    ])
    expect(await new PostgresRateRepository(sql).lookup(`EUR`, `USD`, `2026-10-30`)).toEqual({
      found: true,
      rate: rate(`USD`, `1.1172`, `2026-10-30`),
    })
  })
})

Deno.test("rates.fetch: the recorded ECB reply stores one row per currency, a rerun adds none", async () => {
  await withSchema(async (sql) => {
    const fake = fakeFetch({ [ECB_HOST]: fixture(`frankfurter-saturday-ecb.json`) })
    const deps = {
      sql,
      setup: readRatesSetup(env({}), fake.fetch),
      log: () => {},
      now: () => SATURDAY_16H,
    }
    await fetchOnce(deps)
    const rows = await sql<{ quote: string; rateDate: string; source: string }[]>`
      SELECT quote, to_char(rate_date, 'YYYY-MM-DD') AS rate_date, source
      FROM exchange_rates ORDER BY quote
    `
    expect(rows).toEqual([`GBP`, `JPY`, `USD`].map((quote) => ({
      quote,
      rateDate: `2026-10-30`,
      source: RATE_SOURCES.ecb,
    })))

    await fetchOnce(deps)
    expect(await rowCount(sql)).toBe(3)
  })
})

Deno.test("rates.fetch: a failed ECB call throws, so the worker retries it", async () => {
  await withSchema(async (sql) => {
    const fake = fakeFetch({})
    const job = () =>
      fetchOnce({
        sql,
        setup: readRatesSetup(env({}), fake.fetch),
        log: () => {},
        now: () => SATURDAY_16H,
      })
    await expect(job()).rejects.toThrow(`frankfurter:ECB answered`)
    expect(await rowCount(sql)).toBe(0)
  })
})

Deno.test("rate insert: 0, a negative, an exponent and a non-number are refused and logged", async () => {
  await withSchema(async (sql) => {
    const refused: string[] = []
    const stored = await new PostgresRateRepository(sql).insert(
      [
        rate(`USD`, `0`, `2026-10-30`),
        rate(`GBP`, `-0.83`, `2026-10-30`),
        rate(`JPY`, `1e2`, `2026-10-30`),
        rate(`CHF`, `NaN`, `2026-10-30`),
        rate(`SEK`, `11.2`, `2026-10-30`),
      ],
      new Date(),
      (bad, problem) => refused.push(`${bad.quote}: ${problem}`),
    )
    expect(stored).toBe(1)
    expect(refused).toEqual([
      `USD: the rate is not a decimal above zero`,
      `GBP: the rate is not a decimal above zero`,
      `JPY: the rate is not a decimal above zero`,
      `CHF: the rate is not a decimal above zero`,
    ])
    expect(await rowCount(sql)).toBe(1)
  })
})

Deno.test("rates.fetch: without a fallback key the paid source is never called", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner } = await team(sql)
    await chooseCurrency(sql, groupId, `VND`, owner)
    const fake = fakeFetch({
      [ECB_HOST]: fixture(`frankfurter-ecb-lacks-vnd-aed.json`),
      [PAID_HOST]: fixture(`exchangerate-api-history-eur-2026-10-31.json`),
    })
    await fetchOnce({
      sql,
      setup: readRatesSetup(env({}), fake.fetch),
      log: () => {},
      now: () => SATURDAY_16H,
    })
    expect(fake.calls[PAID_HOST]).toBeUndefined()
    expect(await new PostgresRateRepository(sql).missingOn([`VND`], `2026-10-01`)).toEqual([`VND`])
  })
})

Deno.test("rates.fetch: the fallback asks once for the household currencies the ECB lacks, and a rerun the same day calls nobody", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner } = await team(sql)
    await chooseCurrency(sql, groupId, `VND`, owner)
    const fake = fakeFetch({
      [ECB_HOST]: fixture(`frankfurter-ecb-lacks-vnd-aed.json`),
      [PAID_HOST]: fixture(`exchangerate-api-history-eur-2026-10-31.json`),
    })
    const lines: string[] = []
    const run = (at: Date) =>
      fetchOnce({
        sql,
        setup: readRatesSetup(
          env({ RATES_FALLBACK_KEY: `testkey12345`, RATES_FALLBACK_MONTHLY_CAP: `1` }),
          fake.fetch,
        ),
        log: (line) => lines.push(line),
        now: () => at,
      })

    await run(SATURDAY_16H)
    expect(fake.calls[PAID_HOST]).toBe(1)
    const paid = await sql<{ quote: string; source: string }[]>`
      SELECT quote, source FROM exchange_rates WHERE source = ${RATE_SOURCES.fallback}
    `
    // AED, GBP, JPY and USD are in the reply, but only VND was asked for.
    expect(paid).toEqual([{ quote: `VND`, source: RATE_SOURCES.fallback }])

    // A rerun the same day finds VND rated and calls nobody.
    await run(SATURDAY_16H)
    expect(fake.calls[PAID_HOST]).toBe(1)

    expect(lines).toEqual([])
  })
})

Deno.test("rates.fetch: at the fallback's monthly cap no paid call is made, and the log says why", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner } = await team(sql)
    await chooseCurrency(sql, groupId, `VND`, owner)
    await sql`
      INSERT INTO rate_source_calls (source, month, calls)
      VALUES (${RATE_SOURCES.fallback}, '2026-10-01', 1)
    `
    const fake = fakeFetch({
      [ECB_HOST]: fixture(`frankfurter-ecb-lacks-vnd-aed.json`),
      [PAID_HOST]: fixture(`exchangerate-api-history-eur-2026-10-31.json`),
    })
    const lines: string[] = []
    await fetchOnce({
      sql,
      setup: readRatesSetup(
        env({ RATES_FALLBACK_KEY: `testkey12345`, RATES_FALLBACK_MONTHLY_CAP: `1` }),
        fake.fetch,
      ),
      log: (line) => lines.push(line),
      now: () => SATURDAY_16H,
    })
    expect(fake.calls[PAID_HOST]).toBeUndefined()
    expect(lines).toEqual([
      `exchange rates: exchangerate-api not asked, its monthly cap of 1 is reached`,
    ])
    expect(await new PostgresRateRepository(sql).callsIn(RATE_SOURCES.fallback, `2026-10-01`)).toBe(
      1,
    )
  })
})

Deno.test("fallback calls: ten reservations side by side never pass a cap of three", async () => {
  await withSchema(async (sql) => {
    const rates = new PostgresRateRepository(sql)
    const granted = await Promise.all(
      Array.from({ length: 10 }, () => rates.reserveCall(RATE_SOURCES.fallback, `2026-10-01`, 3)),
    )
    expect(granted.filter(Boolean).length).toBe(3)
    expect(await rates.callsIn(RATE_SOURCES.fallback, `2026-10-01`)).toBe(3)
    expect(await rates.reserveCall(RATE_SOURCES.fallback, `2026-11-01`, 0)).toBe(false)
  })
})

Deno.test("backfill requests: days before the oldest rate, clamped to 1999-01-04, merged when they touch", async () => {
  await withSchema(async (sql) => {
    expect(await requestBackfillBefore(sql, `2020-01-01`)).toBeNull()
    await storeRates(sql, [rate(`USD`, `1.1172`, `2026-10-30`)])
    expect(await requestBackfillBefore(sql, `2026-10-30`)).toBeNull()

    const first = await requestBackfillBefore(sql, `2026-01-01`)
    expect(first).toMatchObject({ fromDate: `2026-01-01`, toDate: `2026-10-29` })
    await Promise.all([
      requestBackfillBefore(sql, `2025-06-01`),
      requestBackfillBefore(sql, `2026-03-01`),
    ])
    expect(await openBackfillRequests(sql)).toEqual([
      { id: expect.any(String), fromDate: `2025-06-01`, toDate: `2026-10-29` },
    ])

    await requestBackfillBefore(sql, `1990-05-05`)
    expect(await openBackfillRequests(sql)).toEqual([
      { id: expect.any(String), fromDate: `1999-01-04`, toDate: `2026-10-29` },
    ])
  })
})
