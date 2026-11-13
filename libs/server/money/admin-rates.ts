import type postgres from "postgres"
import type { AdminRatesSnapshot } from "@domain/money"
import { COIN_PRICE_MONTHLY_CAP, COIN_PRICE_SOURCE, RATE_SOURCES } from "@domain/money"
import { readRepeatingRuns } from "@server/jobs/admin-jobs.ts"
import { RATES_FETCH_JOB } from "@server/jobs/exchange-rates.ts"
import { coinsInUse, readCoinPrices } from "./coin-prices.ts"
import { monthOf, PostgresRateRepository } from "./postgres-rate-repository.ts"

/** How many days the page's table covers, today included. */
export const ADMIN_RATE_DAYS = 7

/** `date` (`YYYY-MM-DD`) of `at`, moved by `days`. */
function dayOf(at: Date, days = 0): string {
  const day = new Date(at)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

/**
 * Reads the admin's Exchange rates page at `now`. `fallbackCap` is the paid fallback's monthly
 * cap, or `null` while it is off; the API reads it from `RATES_FALLBACK_MONTHLY_CAP`, since the
 * key stays with the worker.
 */
export async function readAdminRates(
  sql: postgres.Sql,
  now: Date,
  fallbackCap: number | null,
): Promise<AdminRatesSnapshot> {
  const rates = new PostgresRateRepository(sql)
  const today = dayOf(now)
  const oldest = dayOf(now, 1 - ADMIN_RATE_DAYS)
  const month = monthOf(now)
  const [[run], fetches, latest, inUse, rows, coins, prices, coinCalls] = await Promise.all([
    readRepeatingRuns(sql, [RATES_FETCH_JOB]),
    rates.lastFetches(),
    rates.latestEcbDate(),
    rates.currenciesInUse(),
    rates.days(oldest),
    coinsInUse(sql),
    readCoinPrices(sql),
    rates.callsIn(COIN_PRICE_SOURCE, month),
  ])
  const date = latest ?? today
  const nextMonth = new Date(`${month}T00:00:00Z`)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  const priced = new Set(prices.map((price) => price.coin))
  return {
    lastRun: run.lastRunAt ? { at: run.lastRunAt.toISOString(), failed: run.lastFailed } : null,
    fetches: fetches.map((fetch) => ({ ...fetch, fetchedAt: fetch.fetchedAt.toISOString() })),
    missing: { date, currencies: await rates.missingOn(inUse, date) },
    fallback: fallbackCap === null ? null : {
      used: await rates.callsIn(RATE_SOURCES.fallback, month),
      cap: fallbackCap,
      resetsOn: dayOf(nextMonth),
    },
    days: Array.from({ length: ADMIN_RATE_DAYS }, (_, ago) => {
      const day = dayOf(now, -ago)
      return {
        date: day,
        rows: rows.filter((row) => row.date === day).map((row) => ({
          source: row.source,
          currencies: row.currencies,
          fetchedAt: row.fetchedAt.toISOString(),
        })),
      }
    }),
    coins: {
      prices: prices.map((price) => ({ ...price, fetchedAt: price.fetchedAt.toISOString() })),
      unpriced: coins.filter((coin) => !priced.has(coin)),
      calls: { used: coinCalls, cap: COIN_PRICE_MONTHLY_CAP, resetsOn: dayOf(nextMonth) },
    },
  }
}

/**
 * The paid fallback's monthly cap as the API sees it: `RATES_FALLBACK_MONTHLY_CAP`, or `null`
 * while it is empty, which is the fallback off. The worker holds the key and refuses to start
 * with a key and no cap; the API never gets the key.
 */
export function readAdminFallbackCap(
  env: { get(name: string): string | undefined },
): number | null {
  const text = env.get(`RATES_FALLBACK_MONTHLY_CAP`)?.trim() ?? ``
  if (text === ``) return null
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new Error(`RATES_FALLBACK_MONTHLY_CAP must be a whole number`)
  }
  return Number(text)
}
