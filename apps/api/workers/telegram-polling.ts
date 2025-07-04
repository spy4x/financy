import { config } from "@api/services/config.ts"
import { telegramBot, type TelegramUpdate } from "@api/services/telegram-bot.ts"
import { handleTelegramUpdate } from "../handlers/telegram/updates.ts"
import { sleep } from "@shared/helpers/async.ts"

/**
 * Production-ready Telegram Polling Worker
 * Polls Telegram for updates when webhook is not configured
 * Features: exponential backoff, graceful shutdown, error recovery
 */
export class TelegramPollingWorker {
  private isRunning = false
  private offset = 0
  private consecutiveErrors = 0
  private readonly maxConsecutiveErrors = 10
  private readonly baseDelay = 1000 // 1 second
  private readonly maxDelay = 60000 // 1 minute
  private abortController?: AbortController

  async start(): Promise<void> {
    if (!telegramBot || !config.isDev || config.telegramWebhookUrl) {
      console.log("❌ Telegram polling not needed or not configured")
      return
    }

    // Validate bot before starting
    try {
      const validation = await telegramBot.validateBot()
      if (!validation.valid) {
        console.error("❌ Bot validation failed:", validation.error)
        return
      }
      console.log(`✅ Bot validated: @${validation.botInfo?.username}`)
    } catch (error) {
      console.error("❌ Bot validation error:", error)
      return
    }

    this.isRunning = true
    this.abortController = new AbortController()
    console.log("🔄 Starting Telegram polling mode...")

    // Handle process termination gracefully
    const handleExit = () => {
      console.log("📡 Received termination signal, stopping polling...")
      this.stop()
    }

    Deno.addSignalListener("SIGINT", handleExit)
    Deno.addSignalListener("SIGTERM", handleExit)

    try {
      while (this.isRunning) {
        try {
          // Use shorter timeouts in development for better responsiveness
          const pollingTimeout = config.isDev ? 5 : 15 // 5s dev, 15s production
          const response = await telegramBot.getUpdates(this.offset, pollingTimeout)

          if (response.ok && response.result) {
            const updates = response.result as TelegramUpdate[]

            // Reset error count on successful polling
            this.consecutiveErrors = 0

            for (const update of updates) {
              if (!this.isRunning) break // Check if we should stop

              try {
                await handleTelegramUpdate(update)
                this.offset = update.update_id + 1
              } catch (error) {
                console.error(`❌ Error processing update ${update.update_id}:`, error)
                // Continue processing other updates even if one fails
                this.offset = update.update_id + 1
              }
            }

            // Short delay between successful polls
            if (this.isRunning) {
              await sleep(200) // 200ms delay between polls
            }
          } else if (!response.ok) {
            this.consecutiveErrors++
            console.error(
              `❌ Telegram polling error (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`,
              response.description,
            )

            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
              console.error("❌ Too many consecutive errors, stopping polling")
              this.stop()
              break
            }

            await this.handleError()
          }
        } catch (error) {
          // Check if error is due to abortion (graceful shutdown)
          if (error instanceof Error && error.name === "AbortError") {
            console.log("📡 Polling aborted gracefully")
            break
          }

          this.consecutiveErrors++
          console.error(
            `❌ Telegram polling connection error (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`,
            error,
          )

          if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            console.error("❌ Too many consecutive errors, stopping polling")
            this.stop()
            break
          }

          await this.handleError()
        }
      }
    } finally {
      // Cleanup
      this.abortController?.abort()
      this.isRunning = false
      console.log("🛑 Telegram polling stopped")
    }
  }

  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    this.abortController?.abort()
    console.log("🛑 Stopping Telegram polling...")
  }

  /**
   * Handle errors with exponential backoff
   */
  private async handleError(): Promise<void> {
    if (!this.isRunning) return

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.consecutiveErrors - 1),
      this.maxDelay,
    )

    console.log(`⏳ Waiting ${delay}ms before retry...`)
    await sleep(delay)
  }

  /**
   * Get current polling status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      offset: this.offset,
      consecutiveErrors: this.consecutiveErrors,
    }
  }
}

export const telegramPollingWorker = new TelegramPollingWorker()
