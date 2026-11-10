import {
  createExchangeRateApiRates,
  createFrankfurterRates,
  type ExchangeRateSource,
  type FrankfurterSource,
} from "@spy4x/integrations/exchange-rates"

/** The paid fallback: its source and the most calls it may get in one calendar month. */
export interface RatesFallback {
  source: ExchangeRateSource
  monthlyCap: number
}

/**
 * Where the rate jobs fetch from: the ECB through Frankfurter, always, and the paid fallback only
 * when its key is set (docs/financy/exchange-rates.md). `ecb` also answers for a range of days,
 * which the backfill job asks for.
 */
export interface RatesSetup {
  ecb: FrankfurterSource
  fallback: RatesFallback | null
}

/** The environment variables of the rate jobs, by name; docs/settings.md lists them. */
export const RATES_ENV = {
  frankfurterUrl: `RATES_FRANKFURTER_URL`,
  fallbackKey: `RATES_FALLBACK_KEY`,
  fallbackCap: `RATES_FALLBACK_MONTHLY_CAP`,
} as const

/** The largest monthly cap the setting takes: the biggest plan of exchangerate-api.com. */
const MAX_MONTHLY_CAP = 1_000_000

/**
 * The fallback's monthly cap from the environment, or `null` while its key is unset: the
 * fallback is then off. The cap is required with the key, so a bill can never run without one.
 *
 * @throws Error when the key is set and the cap is missing or not a whole number from 0 to
 * 1,000,000. The message names the variable, never a value.
 */
export function readFallbackCap(env: { get(name: string): string | undefined }): number | null {
  const key = env.get(RATES_ENV.fallbackKey)?.trim()
  if (!key) return null
  const text = env.get(RATES_ENV.fallbackCap)?.trim() ?? ``
  const cap = /^\d+$/.test(text) ? Number(text) : NaN
  if (!Number.isSafeInteger(cap) || cap > MAX_MONTHLY_CAP) {
    throw new Error(
      `${RATES_ENV.fallbackCap} must be a whole number from 0 to ${MAX_MONTHLY_CAP} when ${RATES_ENV.fallbackKey} is set`,
    )
  }
  return cap
}

/**
 * The rate sources from the environment. `RATES_FRANKFURTER_URL` points at a self-hosted
 * Frankfurter; the public one is the default. `fetch` is for tests.
 *
 * @throws Error when the fallback key is set without a valid cap, or a value is malformed. The
 * message names the variable, never its value.
 */
export function readRatesSetup(
  env: { get(name: string): string | undefined },
  fetch?: typeof globalThis.fetch,
): RatesSetup {
  const baseUrl = env.get(RATES_ENV.frankfurterUrl)?.trim() || undefined
  let ecb: FrankfurterSource
  try {
    ecb = createFrankfurterRates({ providers: [`ECB`], baseUrl, fetch })
  } catch {
    throw new Error(`${RATES_ENV.frankfurterUrl} is not an http or https address`)
  }
  const monthlyCap = readFallbackCap(env)
  if (monthlyCap === null) return { ecb, fallback: null }
  let source: ExchangeRateSource
  try {
    source = createExchangeRateApiRates({ apiKey: env.get(RATES_ENV.fallbackKey)!.trim(), fetch })
  } catch {
    throw new Error(`${RATES_ENV.fallbackKey} must be 8 to 64 letters and digits`)
  }
  return { ecb, fallback: { source, monthlyCap } }
}
