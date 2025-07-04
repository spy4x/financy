import { Hono } from "hono"
import { APIContext } from "../_types.ts"
import { config } from "@api/services/config.ts"
import { telegramBot, type TelegramUpdate } from "@api/services/telegram-bot.ts"
import { handleTelegramUpdate } from "../handlers/telegram/updates.ts"

export const telegramRoute = new Hono<APIContext>()
  .get("/health", (c) => {
    return c.json({
      status: "ok",
      service: "financy-telegram-bot",
      enabled: !!config.telegramBotToken,
    })
  })
  .post("/webhook", async (c) => {
    if (!telegramBot) {
      return c.json({ error: "Telegram bot not configured" }, 503)
    }

    try {
      // Verify webhook secret if configured
      if (config.telegramWebhookSecret) {
        const secretToken = c.req.header("X-Telegram-Bot-Api-Secret-Token")
        if (secretToken !== config.telegramWebhookSecret) {
          console.warn("Invalid webhook secret token")
          return c.text("Unauthorized", 401)
        }
      }

      const update: TelegramUpdate = await c.req.json()

      // Process update asynchronously to respond quickly to Telegram
      handleTelegramUpdate(update).catch((error: unknown) => {
        console.error("Error processing Telegram update:", error)
      })

      return c.text("ok")
    } catch (error) {
      console.error("Telegram webhook error:", error)
      return c.text("Bad Request", 400)
    }
  })
  .get("/webhook/info", async (c) => {
    if (!telegramBot) {
      return c.json({ error: "Telegram bot not configured" }, 503)
    }

    try {
      const info = await telegramBot.getWebhookInfo()
      return c.json(info)
    } catch (error) {
      console.error("Failed to get webhook info:", error)
      return c.json({ error: "Failed to get webhook info" }, 500)
    }
  })
