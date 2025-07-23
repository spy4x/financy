import { log } from "@api/services/log.ts"
import { sql } from "@server/db"

// Types for exchange rate providers
export interface RateLimit {
  requestsPerMonth: number
  requestsUsed: number
  resetsAt: Date
}

export interface ExchangeRateResponse {
  success: boolean
  base: string
  date: string
  rates: Record<string, number>
  source: string
}

export interface ExchangeRateProvider {
  name: string
  fetchRates(baseCurrency: string): Promise<ExchangeRateResponse>
  fetchHistoricalRate(from: string, to: string, date: Date): Promise<number>
  getRateLimit(): Promise<RateLimit>
}

/**
 * ExchangeRate-API.com provider (Free tier: 1,500 requests/month)
 * Documentation: https://app.exchangerate-api.com/documentation
 */
class ExchangeRateApiProvider implements ExchangeRateProvider {
  readonly name = "exchangerate-api.com"
  private readonly baseUrl = "https://v6.exchangerate-api.com/v6"
  private readonly apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || Deno.env.get("EXCHANGE_RATE_API_KEY") || ""
    if (!this.apiKey) {
      log("No API key provided for ExchangeRate-API. Using free tier with limited functionality.")
    }
  }

  async fetchRates(baseCurrency: string): Promise<ExchangeRateResponse> {
    const endpoint = this.apiKey
      ? `${this.baseUrl}/${this.apiKey}/latest/${baseCurrency}`
      : `${this.baseUrl}/latest/${baseCurrency}`

    try {
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.result !== "success") {
        throw new Error(`API Error: ${data["error-type"]} - ${data["error-message"]}`)
      }

      return {
        success: true,
        base: data.base_code,
        date: data.time_last_update_utc.split(" ")[0], // Extract date
        rates: data.conversion_rates,
        source: this.name,
      }
    } catch (error) {
      log(`Failed to fetch rates from ${this.name}:`, error)
      throw error
    }
  }

  async fetchHistoricalRate(from: string, to: string, date: Date): Promise<number> {
    if (!this.apiKey) {
      throw new Error("Historical rates require API key for ExchangeRate-API")
    }

    const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD
    const endpoint = `${this.baseUrl}/${this.apiKey}/history/${from}/${dateStr}`

    try {
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.result !== "success") {
        throw new Error(`API Error: ${data["error-type"]} - ${data["error-message"]}`)
      }

      const rate = data.conversion_rates[to]
      if (!rate) {
        throw new Error(`Rate for ${to} not found in historical data`)
      }

      return rate
    } catch (error) {
      log(`Failed to fetch historical rate from ${this.name}:`, error)
      throw error
    }
  }

  async getRateLimit(): Promise<RateLimit> {
    return {
      requestsPerMonth: this.apiKey ? 1500 : 100,
      requestsUsed: 0,
      resetsAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    }
  }
}

/**
 * Simple exchange rate fetcher that only fetches and stores rates
 * No conversion logic - just fetch all rates and store in DB
 */
export class ExchangeRateFetcher {
  private provider: ExchangeRateProvider

  constructor(provider: ExchangeRateProvider) {
    this.provider = provider
  }

  /**
   * Fetch and store latest rates for USD base
   */
  async fetchAndStoreLatestRates(): Promise<void> {
    try {
      log("Fetching latest exchange rates from API...")
      const response = await this.provider.fetchRates("USD")

      // Get USD currency ID
      const usdResult =
        await sql`SELECT id FROM currencies WHERE code = 'USD' AND deleted_at IS NULL LIMIT 1`

      if (usdResult.length === 0) {
        throw new Error("USD currency not found in database")
      }

      const usdId = usdResult[0].id
      let storedCount = 0

      for (const [currencyCode, rate] of Object.entries(response.rates)) {
        try {
          await sql.begin(async (tx) => {
            // Get target currency ID
            const currencyResult = await tx`
              SELECT id FROM currencies WHERE code = ${currencyCode} AND deleted_at IS NULL LIMIT 1
            `

            if (currencyResult.length > 0) {
              const currencyId = currencyResult[0].id

              // Store the rate
              await tx`
                INSERT INTO exchange_rates (from_currency_id, to_currency_id, rate, date, fetched_at)
                VALUES (${usdId}, ${currencyId}, ${rate}, ${response.date}, CURRENT_TIMESTAMP)
                ON CONFLICT (from_currency_id, to_currency_id, date)
                DO UPDATE SET rate = ${rate}, fetched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              `
              storedCount++
            }
          })
        } catch (error) {
          log(`Failed to store rate for ${currencyCode}:`, error)
        }
      }

      log(`Successfully stored ${storedCount} exchange rates`)
    } catch (error) {
      log("Failed to fetch and store exchange rates:", error)
      throw error
    }
  }
}

/**
 * Factory function to create exchange rate fetcher
 */
export function createExchangeRateFetcher(): ExchangeRateFetcher {
  const exchangeRateApiKey = Deno.env.get("EXCHANGE_RATE_API_KEY")
  const primaryProvider = new ExchangeRateApiProvider(exchangeRateApiKey)
  return new ExchangeRateFetcher(primaryProvider)
}

// Export singleton instance
export const exchangeRateFetcher = createExchangeRateFetcher()
