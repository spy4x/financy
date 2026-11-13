/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import type { ExchangeRateSource } from "@spy4x/integrations/exchange-rates"
import { COIN_PRICE_MONTHLY_CAP, COIN_PRICE_SOURCE, RATE_SOURCES } from "@domain/money"
import { ratesFetchJob, type RatesJobDeps } from "@server/jobs/exchange-rates.ts"
import type { JobHandler } from "@server/jobs/jobs.ts"
import { coinsInUse, readCoinPrices, storeCoinPrice } from "@server/money/coin-prices.ts"
import { monthOf, PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { readRatesSetup } from "@server/money/rates-setup.ts"
import { team, withSchema } from "./group-team.ts"
import saturdayEcb from "../../libs/server/money/fixtures/frankfurter-saturday-ecb.json" with {
  type: "json",
}
import bitcoinHistory from "../../libs/server/money/fixtures/coingecko-bitcoin-history-2026-10-30.json" with {
  type: "json",
}
import ethereumHistory from "../../libs/server/money/fixtures/coingecko-ethereum-history-2026-10-30.json" with {
  type: "json",
}

/**
 * Coin prices against a real Postgres built from schema.sql: the daily job's coin step on
 * CoinGecko's recorded `/coins/{id}/history` replies through a fake fetch. Which coins are asked,
 * the rerun that asks nobody, the key's removal that deletes every price, the monthly cap, and the
 * failures that are logged and never stop the ECB step. Needs "DB_HOST", "DB_USER", "DB_PASS" and
 * "DB_NAME" (recipe in docs/handoff.md); it fails when they are missing.
 */

/** Friday 16:00 UTC, the day of the recorded CoinGecko replies. */
const FRIDAY_16H = new Date(`2026-10-30T16:00:00Z`)
const KEY = `CG-testkey12345` // gitleaks:allow
const ECB_HOST = `api.frankfurter.dev`
const COIN_HOST = `api.coingecko.com`

/** The recorded euro prices of one coin on 2026-10-30. */
const BTC_EUR = `69608.44966893936`
const ETH_EUR = `2011.6260541891222`

interface FakeReply {
  status: number
  body: unknown
}

/**
 * A fetch that answers Frankfurter with a recorded ECB day and CoinGecko by coin id, and records
 * each URL asked of CoinGecko. A coin with no reply gets CoinGecko's 404.
 */
function fakeFetch(coins: Record<string, FakeReply> = {
  bitcoin: { status: 200, body: bitcoinHistory },
  ethereum: { status: 200, body: ethereumHistory },
}) {
  const asked: string[] = []
  const fetch: typeof globalThis.fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    let reply: FakeReply = { status: 404, body: {} }
    if (url.host === ECB_HOST) reply = { status: 200, body: saturdayEcb }
    if (url.host === COIN_HOST) {
      asked.push(url.pathname)
      const id = url.pathname.split(`/`)[4]
      reply = coins[id] ?? { status: 404, body: { error: `coin not found` } }
    }
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": `application/json` },
      }),
    )
  }
  return { fetch, asked }
}

function env(values: Record<string, string>) {
  return { get: (name: string) => values[name] }
}

/** One run of the daily job at Friday 16:00, with or without the CoinGecko key. */
async function fetchOnce(
  sql: postgres.Sql,
  fake: ReturnType<typeof fakeFetch>,
  options: { key?: boolean; log?: string[]; at?: Date } = {},
): Promise<void> {
  const deps: RatesJobDeps = {
    sql,
    setup: readRatesSetup(
      env(options.key === false ? {} : { RATES_COINGECKO_KEY: KEY }),
      fake.fetch,
    ),
    log: (line) => options.log?.push(line),
    now: () => options.at ?? FRIDAY_16H,
  }
  await ratesFetchJob(deps)({} as Parameters<JobHandler>[0])
}

/** Adds an account of `kind` holding `currency` to the group. */
async function addAccount(
  sql: postgres.Sql,
  groupId: string,
  currency: string,
  state: { deleted?: boolean; archived?: boolean } = {},
): Promise<void> {
  await sql`
    INSERT INTO accounts (id, group_id, name, kind, currency, change_sequence, archived_at, deleted_at)
    VALUES (
      ${uuidV7()}, ${groupId}, 'Wallet', ${currency === `BTC` || currency === `ETH` ? 7 : 1},
      ${currency}, 1, ${state.archived ? FRIDAY_16H : null}, ${state.deleted ? FRIDAY_16H : null}
    )
  `
}

async function prices(sql: postgres.Sql) {
  return (await readCoinPrices(sql)).map(({ coin, price, date }) => ({ coin, price, date }))
}

async function ecbRows(sql: postgres.Sql): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM exchange_rates WHERE source = ${RATE_SOURCES.ecb}
  `
  return row.count
}

Deno.test("coin prices: with no CoinGecko key the job makes no coin call", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    const fake = fakeFetch()
    await fetchOnce(sql, fake, { key: false })
    expect(fake.asked).toEqual([])
    expect(await prices(sql)).toEqual([])
    expect(await ecbRows(sql)).toBeGreaterThan(0)
  })
})

Deno.test("coin prices: today's euro price of each coin an account holds is stored, one call each, and a rerun calls nobody", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    await addAccount(sql, groupId, `ETH`)
    await addAccount(sql, groupId, `USD`)
    const fake = fakeFetch()
    const log: string[] = []
    await fetchOnce(sql, fake, { log })
    expect(fake.asked).toEqual([
      `/api/v3/coins/bitcoin/history`,
      `/api/v3/coins/ethereum/history`,
    ])
    expect(await prices(sql)).toEqual([
      { coin: `BTC`, price: BTC_EUR, date: `2026-10-30` },
      { coin: `ETH`, price: ETH_EUR, date: `2026-10-30` },
    ])
    expect(await new PostgresRateRepository(sql).callsIn(COIN_PRICE_SOURCE, `2026-10-01`)).toBe(2)

    await fetchOnce(sql, fake, { log })
    expect(fake.asked.length).toBe(2)
    expect(log).toEqual([])
  })
})

Deno.test("coin prices: removing the key deletes every stored price at the next run, and a rerun is the same", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    const fake = fakeFetch()
    await fetchOnce(sql, fake)
    expect((await prices(sql)).length).toBe(1)

    await fetchOnce(sql, fake, { key: false })
    expect(await prices(sql)).toEqual([])
    await fetchOnce(sql, fake, { key: false })
    expect(await prices(sql)).toEqual([])
    expect(fake.asked.length).toBe(1)
  })
})

Deno.test("coin prices: a deleted account or a deleted group holds no coin, an archived account does", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner, repository } = await team(sql)
    await addAccount(sql, groupId, `BTC`, { deleted: true })
    await addAccount(sql, groupId, `ETH`, { archived: true })
    expect(await coinsInUse(sql)).toEqual([`ETH`])

    const other = await repository.create({ id: uuidV7(), name: `Gone` }, owner)
    await addAccount(sql, other.group.id, `BTC`)
    expect(await coinsInUse(sql)).toEqual([`BTC`, `ETH`])
    await sql`UPDATE groups SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${other.group.id}`
    expect(await coinsInUse(sql)).toEqual([`ETH`])
  })
})

Deno.test("coin prices: with no coin in use no call is made, and the price of a coin nobody holds is deleted", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `USD`)
    await storeCoinPrice(sql, { coin: `BTC`, price: `1`, date: `2026-10-29` }, FRIDAY_16H)
    const fake = fakeFetch()
    await fetchOnce(sql, fake)
    expect(fake.asked).toEqual([])
    expect(await prices(sql)).toEqual([])
  })
})

Deno.test("coin prices: yesterday's price is replaced by today's, never kept beside it", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    await storeCoinPrice(sql, { coin: `BTC`, price: `1`, date: `2026-10-29` }, FRIDAY_16H)
    await fetchOnce(sql, fakeFetch())
    expect(await prices(sql)).toEqual([{ coin: `BTC`, price: BTC_EUR, date: `2026-10-30` }])
  })
})

Deno.test("coin prices: the household settings read each stored price with its date, and no fetch time", async () => {
  await withSchema(async (sql) => {
    await storeCoinPrice(sql, { coin: `ETH`, price: ETH_EUR, date: `2026-10-30` }, FRIDAY_16H)
    await storeCoinPrice(sql, { coin: `BTC`, price: BTC_EUR, date: `2026-10-29` }, FRIDAY_16H)
    expect(await new PostgresRateRepository(sql).coinPrices()).toEqual([
      { coin: `BTC`, price: BTC_EUR, date: `2026-10-29` },
      { coin: `ETH`, price: ETH_EUR, date: `2026-10-30` },
    ])
  })
})

Deno.test("coin prices: a stored price of a later day is never moved back by an earlier one", async () => {
  await withSchema(async (sql) => {
    await storeCoinPrice(sql, { coin: `BTC`, price: `2`, date: `2026-10-31` }, FRIDAY_16H)
    await storeCoinPrice(sql, { coin: `BTC`, price: `1`, date: `2026-10-30` }, FRIDAY_16H)
    expect(await prices(sql)).toEqual([{ coin: `BTC`, price: `2`, date: `2026-10-31` }])
  })
})

Deno.test("coin prices: at the monthly cap no call is made, the log says why, and the ECB step runs", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    await sql`
      INSERT INTO rate_source_calls (source, month, calls)
      VALUES (${COIN_PRICE_SOURCE}, ${monthOf(FRIDAY_16H)}, ${COIN_PRICE_MONTHLY_CAP})
    `
    const fake = fakeFetch()
    const log: string[] = []
    await fetchOnce(sql, fake, { log })
    expect(fake.asked).toEqual([])
    expect(log).toEqual([`coin prices: coingecko not asked, its monthly cap of 10000 is reached`])
    expect(await ecbRows(sql)).toBeGreaterThan(0)
  })
})

Deno.test("coin prices: a failed call is logged by its code, counted, not retried, and the next coin and the ECB step still run", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    await addAccount(sql, groupId, `ETH`)
    const fake = fakeFetch({
      bitcoin: { status: 401, body: { status: { error_code: 10002 } } },
      ethereum: { status: 200, body: ethereumHistory },
    })
    const log: string[] = []
    await fetchOnce(sql, fake, { log })
    expect(log).toEqual([`coin prices: coingecko answered unauthorized for BTC`])
    expect(log.join(``)).not.toContain(KEY)
    expect(fake.asked.length).toBe(2)
    expect(await prices(sql)).toEqual([{ coin: `ETH`, price: ETH_EUR, date: `2026-10-30` }])
    expect(await ecbRows(sql)).toBeGreaterThan(0)
    expect(await new PostgresRateRepository(sql).callsIn(COIN_PRICE_SOURCE, `2026-10-01`)).toBe(2)
  })
})

Deno.test("coin prices: a coin CoinGecko has no euro price for stores nothing and is logged", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    const noEuro = { id: `bitcoin`, market_data: { current_price: { usd: 77838.8 } } }
    const log: string[] = []
    await fetchOnce(sql, fakeFetch({ bitcoin: { status: 200, body: noEuro } }), { log })
    await fetchOnce(sql, fakeFetch({}), { log })
    expect(log).toEqual([
      `coin prices: coingecko has no BTC price for 2026-10-30`,
      `coin prices: coingecko has no BTC price for 2026-10-30`,
    ])
    expect(await prices(sql)).toEqual([])
  })
})

Deno.test("coin prices: a price that is not a plain decimal above zero is refused, logged and never stored", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    // ts-libs drops 0, negatives and non-numbers from CoinGecko's reply; this is the job's own
    // check of what a source hands it, so a source that slips is still refused.
    const source: ExchangeRateSource = {
      id: COIN_PRICE_SOURCE,
      daily: (date, base, quotes) =>
        Promise.resolve({
          success: true,
          output: {
            rates: [{ base, quote: quotes[0], rate: `1e5`, date, source: COIN_PRICE_SOURCE }],
            missing: [],
          },
          error: null,
        }),
    }
    const fake = fakeFetch()
    const log: string[] = []
    await ratesFetchJob({
      sql,
      setup: { ...readRatesSetup(env({}), fake.fetch), coins: source },
      log: (line) => log.push(line),
      now: () => FRIDAY_16H,
    })({} as Parameters<JobHandler>[0])
    expect(log).toEqual([
      `coin prices: refused coingecko BTC/EUR 2026-10-30: the rate is not a decimal above zero`,
    ])
    expect(await prices(sql)).toEqual([])
  })
})

Deno.test("coin prices: the largest finite price CoinGecko could send is stored whole, as plain digits", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    const body = { id: `bitcoin`, market_data: { current_price: { eur: Number.MAX_VALUE } } }
    await fetchOnce(sql, fakeFetch({ bitcoin: { status: 200, body } }))
    const [stored] = await prices(sql)
    expect(stored.price).toMatch(/^17976931348623157\d{292}$/)
  })
})

Deno.test("coin prices: a failed statement is logged by its error's name, and the ECB step still runs", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    await addAccount(sql, groupId, `BTC`)
    await sql`DROP TABLE coin_prices`
    const fake = fakeFetch()
    const log: string[] = []
    await fetchOnce(sql, fake, { log })
    expect(log).toEqual([`coin prices: failed with PostgresError`])
    expect(fake.asked).toEqual([])
    expect(await ecbRows(sql)).toBeGreaterThan(0)
  })
})
