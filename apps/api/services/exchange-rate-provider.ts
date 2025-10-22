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
 * Alert types for exchange rate changes
 */
export enum RateChangeAlertType {
  MINOR = 1, // >2% change
  SIGNIFICANT = 2, // >5% change
  MAJOR = 3, // >10% change
}

/**
 * API usage tracking
 */
interface ApiUsageRecord {
  provider: string
  endpoint: string
  success: boolean
  responseTimeMs?: number
  errorMessage?: string
  requestsRemaining?: number
  rateLimitResetAt?: Date
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

    const startTime = Date.now()

    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.result !== "success") {
        throw new Error(`API Error: ${data["error-type"]} - ${data["error-message"]}`)
      }

      // Track successful API usage
      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: true,
        responseTimeMs: responseTime,
      })

      return {
        success: true,
        base: data.base_code,
        date: data.time_last_update_utc.split(" ")[0], // Extract date
        rates: data.conversion_rates,
        source: this.name,
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      log(`Failed to fetch rates from ${this.name}:`, error)

      // Track failed API usage
      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: false,
        responseTimeMs: responseTime,
        errorMessage,
      })

      throw error
    }
  }

  async fetchHistoricalRate(from: string, to: string, date: Date): Promise<number> {
    if (!this.apiKey) {
      throw new Error("Historical rates require API key for ExchangeRate-API")
    }

    const dateStr = date.toISOString().split("T")[0] // YYYY-MM-DD
    const endpoint = `${this.baseUrl}/${this.apiKey}/history/${from}/${dateStr}`
    const startTime = Date.now()

    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(10000),
      })

      const responseTime = Date.now() - startTime

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

      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: true,
        responseTimeMs: responseTime,
      })

      return rate
    } catch (error) {
      const responseTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      log(`Failed to fetch historical rate from ${this.name}:`, error)

      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: false,
        responseTimeMs: responseTime,
        errorMessage,
      })

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

  private async trackApiUsage(usage: ApiUsageRecord): Promise<void> {
    try {
      await sql`
        INSERT INTO exchange_rate_api_usage (
          provider, 
          endpoint, 
          success, 
          response_time_ms, 
          error_message
        )
        VALUES (
          ${usage.provider},
          ${usage.endpoint},
          ${usage.success},
          ${usage.responseTimeMs || null},
          ${usage.errorMessage || null}
        )
      `
    } catch (error) {
      log("Failed to track API usage:", error)
      // Don't throw - tracking failures shouldn't break the main flow
    }
  }
}

/**
 * Fixer.io provider (Free tier: 100 requests/month)
 * Documentation: https://fixer.io/documentation
 * Used as backup when primary provider fails
 */
class FixerIoProvider implements ExchangeRateProvider {
  readonly name = "fixer.io"
  private readonly baseUrl = "https://api.apilayer.com/fixer"
  private readonly apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || Deno.env.get("FIXER_IO_API_KEY") || ""
    if (!this.apiKey) {
      log("No API key provided for Fixer.io. Backup provider unavailable.")
    }
  }

  async fetchRates(baseCurrency: string): Promise<ExchangeRateResponse> {
    if (!this.apiKey) {
      throw new Error("Fixer.io API key required")
    }

    const endpoint = `${this.baseUrl}/latest?base=${baseCurrency}`
    const startTime = Date.now()

    try {
      const response = await fetch(endpoint, {
        headers: {
          "apikey": this.apiKey,
        },
        signal: AbortSignal.timeout(10000),
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(`API Error: ${data.error?.type} - ${data.error?.info}`)
      }

      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: true,
        responseTimeMs: responseTime,
      })

      return {
        success: true,
        base: data.base,
        date: data.date,
        rates: data.rates,
        source: this.name,
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      log(`Failed to fetch rates from ${this.name}:`, error)

      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: false,
        responseTimeMs: responseTime,
        errorMessage,
      })

      throw error
    }
  }

  async fetchHistoricalRate(from: string, to: string, date: Date): Promise<number> {
    if (!this.apiKey) {
      throw new Error("Fixer.io API key required")
    }

    const dateStr = date.toISOString().split("T")[0]
    const endpoint = `${this.baseUrl}/${dateStr}?base=${from}&symbols=${to}`
    const startTime = Date.now()

    try {
      const response = await fetch(endpoint, {
        headers: {
          "apikey": this.apiKey,
        },
        signal: AbortSignal.timeout(10000),
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(`API Error: ${data.error?.type} - ${data.error?.info}`)
      }

      const rate = data.rates[to]
      if (!rate) {
        throw new Error(`Rate for ${to} not found`)
      }

      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: true,
        responseTimeMs: responseTime,
      })

      return rate
    } catch (error) {
      const responseTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      log(`Failed to fetch historical rate from ${this.name}:`, error)

      await this.trackApiUsage({
        provider: this.name,
        endpoint,
        success: false,
        responseTimeMs: responseTime,
        errorMessage,
      })

      throw error
    }
  }

  async getRateLimit(): Promise<RateLimit> {
    return {
      requestsPerMonth: 100,
      requestsUsed: 0,
      resetsAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    }
  }

  private async trackApiUsage(usage: ApiUsageRecord): Promise<void> {
    try {
      await sql`
        INSERT INTO exchange_rate_api_usage (
          provider, 
          endpoint, 
          success, 
          response_time_ms, 
          error_message
        )
        VALUES (
          ${usage.provider},
          ${usage.endpoint},
          ${usage.success},
          ${usage.responseTimeMs || null},
          ${usage.errorMessage || null}
        )
      `
    } catch (error) {
      log("Failed to track API usage:", error)
    }
  }
}

/**
 * Simple exchange rate fetcher that only fetches and stores rates
 * No conversion logic - just fetch all rates and store in DB
 * Includes fallback provider and rate validation
 */
export class ExchangeRateFetcher {
  private primaryProvider: ExchangeRateProvider
  private fallbackProvider?: ExchangeRateProvider
  private readonly RATE_CHANGE_THRESHOLD_MINOR = 0.02 // 2%
  private readonly RATE_CHANGE_THRESHOLD_SIGNIFICANT = 0.05 // 5%
  private readonly RATE_CHANGE_THRESHOLD_MAJOR = 0.10 // 10%
  private readonly MAX_RETRY_ATTEMPTS = 3
  private readonly RETRY_DELAY_MS = 2000

  constructor(primaryProvider: ExchangeRateProvider, fallbackProvider?: ExchangeRateProvider) {
    this.primaryProvider = primaryProvider
    this.fallbackProvider = fallbackProvider
  }

  /**
   * Fetch and store latest rates for USD base with retry and fallback
   */
  async fetchAndStoreLatestRates(): Promise<void> {
    let lastError: Error | null = null

    // Try primary provider with retries
    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        log(
          `Fetching exchange rates from ${this.primaryProvider.name} (attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS})...`,
        )
        await this.fetchAndStoreFromProvider(this.primaryProvider)
        log(`Successfully fetched rates from ${this.primaryProvider.name}`)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        log(`Failed to fetch from ${this.primaryProvider.name} (attempt ${attempt}):`, error)

        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          // Exponential backoff
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1)
          log(`Retrying in ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    // Try fallback provider if available
    if (this.fallbackProvider) {
      try {
        log(`Primary provider failed. Trying fallback provider: ${this.fallbackProvider.name}`)
        await this.fetchAndStoreFromProvider(this.fallbackProvider)
        log(`Successfully fetched rates from fallback provider: ${this.fallbackProvider.name}`)
        return
      } catch (error) {
        log(`Fallback provider also failed:`, error)
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    // All attempts failed
    log("All exchange rate fetch attempts failed. Using last known rates.")
    throw lastError || new Error("Failed to fetch exchange rates from all providers")
  }

  /**
   * Fetch and store rates from a specific provider
   */
  private async fetchAndStoreFromProvider(provider: ExchangeRateProvider): Promise<void> {
    const response = await provider.fetchRates("USD")

    // Get USD currency ID
    const usdResult =
      await sql`SELECT id FROM currencies WHERE code = 'USD' AND deleted_at IS NULL LIMIT 1`

    if (usdResult.length === 0) {
      throw new Error("USD currency not found in database")
    }

    const usdId = usdResult[0].id
    let storedCount = 0
    let alertsCreated = 0

    for (const [currencyCode, newRate] of Object.entries(response.rates)) {
      try {
        await sql.begin(async (tx) => {
          // Get target currency ID
          const currencyResult = await tx`
            SELECT id FROM currencies WHERE code = ${currencyCode} AND deleted_at IS NULL LIMIT 1
          `

          if (currencyResult.length > 0) {
            const currencyId = currencyResult[0].id

            // Validate rate (basic sanity check)
            if (!this.isValidRate(newRate)) {
              log(`Skipping invalid rate for ${currencyCode}: ${newRate}`)
              return
            }

            // Get previous rate for comparison
            const prevRateResult = await tx`
              SELECT rate FROM exchange_rates
              WHERE from_currency_id = ${usdId}
                AND to_currency_id = ${currencyId}
                AND deleted_at IS NULL
              ORDER BY date DESC
              LIMIT 1
            `

            const prevRate = prevRateResult.length > 0 ? Number(prevRateResult[0].rate) : null

            // Check for manual override
            const overrideResult = await tx`
              SELECT rate, reason FROM exchange_rate_overrides
              WHERE from_currency_id = ${usdId}
                AND to_currency_id = ${currencyId}
                AND valid_from <= CURRENT_TIMESTAMP
                AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
                AND deleted_at IS NULL
              ORDER BY valid_from DESC
              LIMIT 1
            `

            const finalRate = overrideResult.length > 0 ? Number(overrideResult[0].rate) : newRate

            if (overrideResult.length > 0) {
              log(
                `Using manual override for ${currencyCode}: ${finalRate} (${
                  overrideResult[0].reason
                })`,
              )
            }

            // Store the rate
            await tx`
              INSERT INTO exchange_rates (from_currency_id, to_currency_id, rate, date, fetched_at)
              VALUES (${usdId}, ${currencyId}, ${finalRate}, ${response.date}, CURRENT_TIMESTAMP)
              ON CONFLICT (from_currency_id, to_currency_id, date)
              DO UPDATE SET rate = ${finalRate}, fetched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            `
            storedCount++

            // Check for significant rate changes and create alerts
            if (prevRate && prevRate !== newRate) {
              const changePercent = Math.abs((newRate - prevRate) / prevRate)
              let alertType: RateChangeAlertType | null = null

              if (changePercent >= this.RATE_CHANGE_THRESHOLD_MAJOR) {
                alertType = RateChangeAlertType.MAJOR
              } else if (changePercent >= this.RATE_CHANGE_THRESHOLD_SIGNIFICANT) {
                alertType = RateChangeAlertType.SIGNIFICANT
              } else if (changePercent >= this.RATE_CHANGE_THRESHOLD_MINOR) {
                alertType = RateChangeAlertType.MINOR
              }

              if (alertType) {
                await tx`
                  INSERT INTO exchange_rate_alerts (
                    from_currency_id,
                    to_currency_id,
                    old_rate,
                    new_rate,
                    change_percent,
                    alert_type
                  )
                  VALUES (
                    ${usdId},
                    ${currencyId},
                    ${prevRate},
                    ${newRate},
                    ${changePercent * 100},
                    ${alertType}
                  )
                `
                alertsCreated++
                log(
                  `Alert created for ${currencyCode}: ${(changePercent * 100).toFixed(2)}% change`,
                )
              }
            }
          }
        })
      } catch (error) {
        log(`Failed to store rate for ${currencyCode}:`, error)
      }
    }

    log(`Successfully stored ${storedCount} exchange rates, created ${alertsCreated} alerts`)
  }

  /**
   * Validate that a rate is reasonable
   */
  private isValidRate(rate: number): boolean {
    return (
      typeof rate === "number" &&
      !isNaN(rate) &&
      isFinite(rate) &&
      rate > 0 &&
      rate < 1000000 // Reasonable upper bound
    )
  }

  /**
   * Get API usage statistics
   */
  async getApiUsageStats(provider?: string, days = 30): Promise<{
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    averageResponseTime: number
    lastRequest: Date | null
  }> {
    const stats = await sql`
      SELECT 
        COUNT(*)::int as total_requests,
        SUM(CASE WHEN success THEN 1 ELSE 0 END)::int as successful_requests,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)::int as failed_requests,
        AVG(response_time_ms)::int as average_response_time,
        MAX(created_at) as last_request
      FROM exchange_rate_api_usage
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
        ${provider ? sql`AND provider = ${provider}` : sql``}
    `

    return {
      totalRequests: stats[0].total_requests || 0,
      successfulRequests: stats[0].successful_requests || 0,
      failedRequests: stats[0].failed_requests || 0,
      averageResponseTime: stats[0].average_response_time || 0,
      lastRequest: stats[0].last_request,
    }
  }
}

/**
 * Factory function to create exchange rate fetcher with primary and fallback providers
 */
export function createExchangeRateFetcher(): ExchangeRateFetcher {
  const exchangeRateApiKey = Deno.env.get("EXCHANGE_RATE_API_KEY")
  const fixerIoApiKey = Deno.env.get("FIXER_IO_API_KEY")

  const primaryProvider = new ExchangeRateApiProvider(exchangeRateApiKey)

  // Only create fallback provider if API key is available
  const fallbackProvider = fixerIoApiKey ? new FixerIoProvider(fixerIoApiKey) : undefined

  if (fallbackProvider) {
    log("Exchange rate fetcher initialized with primary and fallback providers")
  } else {
    log("Exchange rate fetcher initialized with primary provider only (no fallback)")
  }

  return new ExchangeRateFetcher(primaryProvider, fallbackProvider)
}

// Export singleton instance
export const exchangeRateFetcher = createExchangeRateFetcher()
