import { log } from "@api/services/log.ts"
import { exchangeRateFetcher as currencyRateFetcher } from "@api/services/exchange-rate-provider.ts"

/**
 * Background worker for fetching exchange rates
 * Runs daily to update exchange rates from external APIs
 */
class ExchangeRateFetcher {
  private isRunning = false
  private intervalId?: number

  /**
   * Start the exchange rate fetcher
   * Runs immediately and then daily at a specified time
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log("Exchange rate fetcher is already running")
      return
    }

    this.isRunning = true
    log("Starting exchange rate fetcher...")

    // Fetch rates immediately on startup
    try {
      await this.fetchRates()
    } catch (error) {
      log("Initial exchange rate fetch failed:", error)
    }

    // Schedule daily fetches (every 24 hours)
    this.intervalId = setInterval(async () => {
      try {
        await this.fetchRates()
      } catch (error) {
        log("Scheduled exchange rate fetch failed:", error)
      }
    }, 24 * 60 * 60 * 1000) // 24 hours in milliseconds

    log("Exchange rate fetcher started successfully")
  }

  /**
   * Stop the exchange rate fetcher
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    this.isRunning = false
    log("Exchange rate fetcher stopped")
  }

  /**
   * Fetch latest exchange rates from external API
   */
  private async fetchRates(): Promise<void> {
    const startTime = Date.now()
    log("Starting exchange rate fetch...")

    try {
      await currencyRateFetcher.fetchAndStoreLatestRates()

      const duration = Date.now() - startTime
      log(`Exchange rate fetch completed successfully in ${duration}ms`)
    } catch (error) {
      const duration = Date.now() - startTime
      log(`Exchange rate fetch failed after ${duration}ms:`, error)

      // Re-throw to allow caller to handle
      throw error
    }
  }

  /**
   * Manually trigger a rate fetch (for admin operations)
   */
  async triggerFetch(): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Exchange rate fetcher is not running")
    }

    log("Manual exchange rate fetch triggered")
    await this.fetchRates()
  }

  /**
   * Get fetcher status
   */
  getStatus(): { isRunning: boolean; nextRun?: Date } {
    return {
      isRunning: this.isRunning,
      nextRun: this.isRunning ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,
    }
  }
}

// Export singleton instance
export const exchangeRateFetcher = new ExchangeRateFetcher()

// Auto-start in production environments
if (Deno.env.get("DENO_ENV") === "production") {
  exchangeRateFetcher.start().catch((error) => {
    log("Failed to start exchange rate fetcher:", error)
  })
}
