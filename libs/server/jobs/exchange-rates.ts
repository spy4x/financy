import type postgres from "postgres"
import { currencies, type ExchangeRate } from "@spy4x/platform/universal/money"
import { ECB_BASE } from "@domain/money"
import { monthOf, PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import type { RatesSetup } from "@server/money/rates-setup.ts"
import type { JobHandler } from "./jobs.ts"

/** The daily job that stores the day's rates. It repeats at 16:00 UTC, after the ECB publishes. */
export const RATES_FETCH_JOB = `rates.fetch`

/** When {@link RATES_FETCH_JOB} runs, in UTC. */
export const RATES_FETCH_CRON = `0 16 * * *`

/** What the rate jobs need. */
export interface RatesJobDeps {
  sql: postgres.Sql
  /** `null` when the worker has no rate setup (a test of other jobs): the job fetches nothing. */
  setup: RatesSetup | null
  /** Told about each refused rate and each fallback call not made. Never gets a key. */
  log: (line: string) => void
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

/**
 * A rate source answered with an error. Only the source and the error's code are kept: the job's
 * row records the class name, and the log line names neither a URL nor a key.
 */
export class RatesFetchError extends Error {
  constructor(source: string, code: string) {
    super(`${source} answered ${code}`)
    this.name = `RatesFetchError`
  }
}

/** Every ISO 4217 code but the euro: what the ECB is asked for. It answers for the ones it has. */
export function ecbQuotes(): string[] {
  return Object.keys(currencies).filter((code) => code !== ECB_BASE)
}

/** Logs a refused rate by its pair, day and source; never its whole reply. */
function refusal(log: (line: string) => void) {
  return (rate: ExchangeRate, problem: string) =>
    log(
      `exchange rates: refused ${rate.source} ${rate.base}/${rate.quote} ${rate.date}: ${problem}`,
    )
}

/**
 * Stores the day's rates (`rates.fetch`). First the ECB's, through Frankfurter, against the euro:
 * on a weekend or a holiday Frankfurter answers with the last working day, whose rows exist
 * already, so a rerun stores nothing. A failed ECB call throws, and the worker retries it.
 *
 * Then, only with the fallback on, the paid source is asked for the main currencies households use
 * that the ECB has no rate for today, in one call. The call is counted before it is made and only
 * while the month is under the cap; at the cap no call is made. A failed paid call is logged and
 * not retried, so a retry never spends a second call.
 */
export function ratesFetchJob(deps: RatesJobDeps): JobHandler {
  return async () => {
    const { setup } = deps
    if (!setup) return
    const at = deps.now?.() ?? new Date()
    const today = at.toISOString().slice(0, 10)
    const rates = new PostgresRateRepository(deps.sql)
    const refuse = refusal(deps.log)

    const ecb = await setup.ecb.daily(today, ECB_BASE, ecbQuotes())
    if (!ecb.success) throw new RatesFetchError(ecb.error.source, ecb.error.code)
    await rates.insert(ecb.output.rates, at, refuse)

    if (!setup.fallback) return
    const fromEcb = new Set(ecb.output.rates.map((rate) => rate.quote))
    const lacking = (await rates.currenciesInUse()).filter((code) =>
      code !== ECB_BASE && !fromEcb.has(code)
    )
    const missing = await rates.missingOn(lacking, today)
    if (missing.length === 0) return
    const { source, monthlyCap } = setup.fallback
    if (!(await rates.reserveCall(source.id, monthOf(at), monthlyCap))) {
      deps.log(
        `exchange rates: ${source.id} not asked, its monthly cap of ${monthlyCap} is reached`,
      )
      return
    }
    const paid = await source.daily(today, ECB_BASE, missing)
    if (!paid.success) {
      deps.log(`exchange rates: ${source.id} answered ${paid.error.code}`)
      return
    }
    await rates.insert(paid.output.rates, at, refuse)
  }
}
