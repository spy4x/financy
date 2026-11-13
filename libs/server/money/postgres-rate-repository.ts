import type postgres from "postgres"
import { crossRate, type ExchangeRate } from "@spy4x/platform/universal/money"
import {
  type CoinPrice,
  DEFAULT_BASE_CURRENCY,
  ECB_BASE,
  type HouseholdRateReader,
  RATE_SOURCES,
  type RateLookup,
} from "@domain/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { readCoinPrices } from "./coin-prices.ts"

/** A rate as a source may send it: a plain decimal above zero, nothing else. */
const PLAIN_POSITIVE_DECIMAL = /^(?=.*[1-9])\d+(\.\d+)?$/
const CODE = /^[A-Z][A-Z0-9]{1,11}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Why a rate is refused before it is stored, or `null` when it may be. A rate is a plain decimal
 * string above zero for two different codes on a calendar date; `0`, a negative, `NaN` or an
 * exponent is refused, so no total is ever made with it.
 */
export function rateProblem(rate: ExchangeRate): string | null {
  if (typeof rate.rate !== `string` || !PLAIN_POSITIVE_DECIMAL.test(rate.rate)) {
    return `the rate is not a decimal above zero`
  }
  if (!CODE.test(rate.base) || !CODE.test(rate.quote) || rate.base === rate.quote) {
    return `the pair is not two currency codes`
  }
  if (!DATE.test(rate.date) || Number.isNaN(Date.parse(`${rate.date}T00:00:00Z`))) {
    return `the date is not a calendar date`
  }
  if (typeof rate.source !== `string` || rate.source.trim() === `` || rate.source.length > 40) {
    return `the source is not named`
  }
  return null
}

interface LegRow {
  rateDate: string
  source: string
  baseRate: string
  quoteRate: string
}

/** One source's rates of one day, for the admin's table. */
export interface RateDayRow {
  date: string
  source: string
  currencies: number
  fetchedAt: Date
}

/** The last rates one source stored: when, and how many. */
export interface RateFetchRow {
  source: string
  fetchedAt: Date
  count: number
}

/** The first day of `date`'s month, `YYYY-MM-01`. */
export function monthOf(date: Date): string {
  return `${date.toISOString().slice(0, 7)}-01`
}

/**
 * Exchange rates in Postgres. Rows are only ever inserted: a rerun of a fetch adds nothing, and a
 * stored rate is never changed. Every read names the date and source of the rate it returns.
 */
export class PostgresRateRepository implements HouseholdRateReader {
  constructor(private readonly sql: postgres.Sql) {}

  /**
   * Stores `rates`, all stamped `fetchedAt`, and returns how many rows were new. A rate that is not
   * a decimal above zero, or names no pair or date, is passed to `refuse` with why and never
   * stored. A rate already stored for its pair, day and source is left as it was.
   */
  async insert(
    rates: readonly ExchangeRate[],
    fetchedAt: Date,
    refuse: (rate: ExchangeRate, problem: string) => void,
  ): Promise<number> {
    const rows = []
    for (const rate of rates) {
      const problem = rateProblem(rate)
      if (problem) {
        refuse(rate, problem)
        continue
      }
      rows.push({
        id: uuidV7(),
        base: rate.base,
        quote: rate.quote,
        rate: rate.rate,
        rate_date: rate.date,
        source: rate.source,
        fetched_at: fetchedAt,
      })
    }
    if (rows.length === 0) return 0
    const inserted = await this.sql`
      INSERT INTO exchange_rates ${this.sql(rows)}
      ON CONFLICT (base, quote, rate_date, source) DO NOTHING
      RETURNING id
    `
    return inserted.length
  }

  /**
   * The rate from `base` to `quote` on `date` (`YYYY-MM-DD`): that day's, else the latest earlier
   * one (R6), so a Saturday gets Friday's rate and Friday's date. Rates are stored against the
   * euro, so any other pair is a cross rate, rate(EUR to quote) / rate(EUR to base), with both legs
   * from one source on one day (R7). On a day both sources have, the ECB's is taken. No rate is
   * `{ found: false }`, never a rate of 0 or 1.
   */
  async lookup(base: string, quote: string, date: string): Promise<RateLookup> {
    if (base === quote) {
      return { found: true, rate: { base, quote, rate: `1`, date, source: `same currency` } }
    }
    const legs = [base, quote].filter((code) => code !== ECB_BASE)
    const [row] = legs.length === 1
      ? await this.sql<LegRow[]>`
        SELECT
          to_char(rate_date, 'YYYY-MM-DD') AS rate_date,
          source,
          rate::text AS base_rate,
          rate::text AS quote_rate
        FROM exchange_rates
        WHERE base = ${ECB_BASE} AND quote = ${legs[0]} AND rate_date <= ${date}::date
        ORDER BY rate_date DESC, (source = ${RATE_SOURCES.ecb}) DESC
        LIMIT 1
      `
      : await this.sql<LegRow[]>`
        SELECT
          to_char(from_base.rate_date, 'YYYY-MM-DD') AS rate_date,
          from_base.source,
          from_base.rate::text AS base_rate,
          to_quote.rate::text AS quote_rate
        FROM exchange_rates AS from_base
        INNER JOIN exchange_rates AS to_quote
          ON to_quote.base = from_base.base
          AND to_quote.rate_date = from_base.rate_date
          AND to_quote.source = from_base.source
        WHERE from_base.base = ${ECB_BASE}
          AND from_base.quote = ${base}
          AND to_quote.quote = ${quote}
          AND from_base.rate_date <= ${date}::date
        ORDER BY from_base.rate_date DESC, (from_base.source = ${RATE_SOURCES.ecb}) DESC
        LIMIT 1
      `
    if (!row) return { found: false, reason: `no-rate` }
    const leg = (code: string, rate: string): ExchangeRate => ({
      base: ECB_BASE,
      quote: code,
      rate,
      date: row.rateDate,
      source: row.source,
    })
    // One side is the euro: the stored rate is the answer, quoted from the euro.
    if (base === ECB_BASE) return { found: true, rate: leg(quote, row.quoteRate) }
    if (quote === ECB_BASE) return { found: true, rate: leg(base, row.baseRate) }
    const crossed = crossRate(leg(base, row.baseRate), leg(quote, row.quoteRate))
    if (!crossed.ok) return { found: false, reason: `no-rate` }
    return { found: true, rate: crossed.value }
  }

  /** The first day any rate is stored for, or `null` with none. */
  async oldestDate(): Promise<string | null> {
    const [row] = await this.sql<{ oldest: string | null }[]>`
      SELECT to_char(min(rate_date), 'YYYY-MM-DD') AS oldest FROM exchange_rates
    `
    return row.oldest
  }

  /**
   * The latest ECB rate of each of `currencies` against the euro, with its date. Only the ECB's:
   * a fallback rate never leaves the server.
   */
  async latestEcbRates(currencies: readonly string[]): Promise<ExchangeRate[]> {
    const quotes = [...new Set(currencies)].filter((code) => code !== ECB_BASE)
    if (quotes.length === 0) return []
    return await this.sql<ExchangeRate[]>`
      SELECT DISTINCT ON (quote)
        base, quote, rate::text AS rate, to_char(rate_date, 'YYYY-MM-DD') AS date, source
      FROM exchange_rates
      WHERE base = ${ECB_BASE} AND source = ${RATE_SOURCES.ecb} AND quote IN ${this.sql(quotes)}
      ORDER BY quote, rate_date DESC
    `
  }

  /** Every stored coin price, by coin, without the time it was fetched. */
  async coinPrices(): Promise<CoinPrice[]> {
    return (await readCoinPrices(this.sql)).map(({ coin, price, date }) => ({ coin, price, date }))
  }

  /** Every currency with a rate from any source in the 7 days before the latest one, and the euro. */
  async ratedCurrencies(): Promise<string[]> {
    const rows = await this.sql<{ quote: string }[]>`
      SELECT DISTINCT quote FROM exchange_rates
      WHERE base = ${ECB_BASE}
        AND rate_date > (SELECT max(rate_date) FROM exchange_rates) - 7
      ORDER BY quote
    `
    return [...new Set([ECB_BASE, ...rows.map((row) => row.quote)])].sort()
  }

  /**
   * The main currencies households use: each saved one of a group that is not deleted, and the
   * default, which every unsaved group has.
   */
  async currenciesInUse(): Promise<string[]> {
    const rows = await this.sql<{ code: string }[]>`
      SELECT DISTINCT household_settings.base_currency AS code
      FROM household_settings
      INNER JOIN groups ON groups.id = household_settings.group_id
      WHERE groups.deleted_at IS NULL
    `
    return [...new Set([DEFAULT_BASE_CURRENCY, ...rows.map((row) => row.code)])].sort()
  }

  /**
   * Counts one call to `source` in `month` (`YYYY-MM-01`) unless the month already holds `cap`
   * calls, in one statement, so two runs side by side never pass the cap together. `true` when the
   * call was counted and may be made; `false` at the cap, when no call may be made.
   */
  async reserveCall(source: string, month: string, cap: number): Promise<boolean> {
    const rows = await this.sql`
      INSERT INTO rate_source_calls (source, month, calls)
      SELECT ${source}, ${month}::date, 1 WHERE ${cap}::int > 0
      ON CONFLICT (source, month) DO UPDATE SET calls = rate_source_calls.calls + 1
      WHERE rate_source_calls.calls < ${cap}::int
      RETURNING calls
    `
    return rows.length === 1
  }

  /** The calls counted to `source` in `month` (`YYYY-MM-01`). */
  async callsIn(source: string, month: string): Promise<number> {
    const [row] = await this.sql<{ calls: number }[]>`
      SELECT calls FROM rate_source_calls WHERE source = ${source} AND month = ${month}::date
    `
    return row?.calls ?? 0
  }

  /** The last time each source stored rates, and how many it stored then. */
  async lastFetches(): Promise<RateFetchRow[]> {
    return await this.sql<RateFetchRow[]>`
      SELECT DISTINCT ON (source) source, fetched_at, count(*)::int AS count
      FROM exchange_rates
      GROUP BY source, fetched_at
      ORDER BY source, fetched_at DESC
    `
  }

  /** Each source's rates per day, from `from` (`YYYY-MM-DD`) on, newest first. */
  async days(from: string): Promise<RateDayRow[]> {
    return await this.sql<RateDayRow[]>`
      SELECT
        to_char(rate_date, 'YYYY-MM-DD') AS date,
        source,
        count(*)::int AS currencies,
        max(fetched_at) AS fetched_at
      FROM exchange_rates
      WHERE rate_date >= ${from}::date
      GROUP BY rate_date, source
      ORDER BY rate_date DESC, source
    `
  }

  /** The newest day with an ECB rate, or `null` with none. */
  async latestEcbDate(): Promise<string | null> {
    const [row] = await this.sql<{ latest: string | null }[]>`
      SELECT to_char(max(rate_date), 'YYYY-MM-DD') AS latest
      FROM exchange_rates WHERE source = ${RATE_SOURCES.ecb}
    `
    return row.latest
  }

  /** Which of `currencies` have no rate from any source on `date` or later. */
  async missingOn(currencies: readonly string[], date: string): Promise<string[]> {
    const quotes = currencies.filter((code) => code !== ECB_BASE)
    if (quotes.length === 0) return []
    const rows = await this.sql<{ quote: string }[]>`
      SELECT DISTINCT quote FROM exchange_rates
      WHERE base = ${ECB_BASE} AND rate_date >= ${date}::date AND quote IN ${this.sql(quotes)}
    `
    const rated = new Set(rows.map((row) => row.quote))
    return quotes.filter((code) => !rated.has(code)).sort()
  }
}
