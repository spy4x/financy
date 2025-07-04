import { Hono } from "hono"
import { contextStorage } from "hono/context-storage"
import { requestId } from "hono/request-id"
import { db } from "@api/services/db.ts"
import { config } from "@api/services/config.ts"
import { telegramBot } from "@api/services/telegram-bot.ts"
import { telegramPollingWorker } from "./workers/telegram-polling.ts"
import { websocketsRoute } from "./routes/websockets.ts"
import { telegramRoute } from "./routes/telegram.ts"
import { logger } from "@api/middlewares/log.ts"
import { parseAuth } from "@api/middlewares/auth.ts"
import { APIContext } from "./_types.ts"
import { getRandomString } from "@shared/helpers/random.ts"
import { authRoute } from "./routes/auth.ts"

// Initialize event handlers
import "./cqrs/+init.ts"

const app = new Hono<APIContext>().basePath("/api")
app.use(
  contextStorage(),
  requestId({ generator: () => getRandomString(8) }),
  logger(),
  parseAuth,
)
app.route("/ws", websocketsRoute) // isAuthenticated check is inside, because ⚠️ order of middlewares matters. Don't move this line if you don't know what you're doing.
app.route("/telegram", telegramRoute) // Telegram bot endpoints

app.get(
  "/health",
  async (c) =>
    c.json({
      status: "ok",
      isDbConnected: await db.isConnected(),
      telegram: {
        enabled: !!config.telegramBotToken,
        webhookMode: !!config.telegramWebhookUrl,
        pollingMode: !config.telegramWebhookUrl && config.isDev,
      },
      date: Date.now(),
    }),
)
app.route("/auth", authRoute) // has some public routes and some more protected

// Initialize Telegram bot if configured
if (telegramBot && config.telegramBotToken) {
  console.log("🤖 Telegram bot enabled")

  if (config.telegramWebhookUrl) {
    // Webhook mode (production)
    console.log(`🔗 Setting Telegram webhook: ${config.telegramWebhookUrl}`)
    telegramBot.setWebhook(config.telegramWebhookUrl, config.telegramWebhookSecret)
      .then((result) => {
        if (result.ok) {
          console.log("✅ Telegram webhook set successfully")
        } else {
          console.error("❌ Failed to set Telegram webhook:", result.description)
        }
      })
      .catch((error) => {
        console.error("❌ Error setting Telegram webhook:", error)
      })
  } else if (config.isDev) {
    // Polling mode (development)
    telegramPollingWorker.start().catch((error) => {
      console.error("❌ Failed to start Telegram polling:", error)
    })
  }
}

// Handle graceful shutdown for Telegram
Deno.addSignalListener("SIGINT", async () => {
  console.log("\n🛑 Shutting down...")

  if (telegramBot && config.telegramWebhookUrl) {
    try {
      await telegramBot.deleteWebhook()
      console.log("✅ Telegram webhook deleted")
    } catch (error) {
      console.error("❌ Error deleting Telegram webhook:", error)
    }
  }

  if (config.isDev) {
    telegramPollingWorker.stop()
  }

  Deno.exit(0)
})

export default app
