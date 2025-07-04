import type { TelegramUpdate } from "@api/services/telegram-bot.ts"
import {
  handleTelegramAccounts,
  handleTelegramAdd,
  handleTelegramAnalytics,
  handleTelegramCancel,
  handleTelegramCategories,
  handleTelegramHelp,
  handleTelegramLink,
  handleTelegramRecent,
  handleTelegramStart,
  handleTelegramText,
} from "./commands.ts"
import { handleTelegramCallback } from "./callbacks.ts"

/**
 * Main update handler that routes messages and callbacks to appropriate handlers
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  try {
    // Handle callback queries (inline keyboard button presses)
    if (update.callback_query) {
      await handleTelegramCallback(update.callback_query)
      return
    }

    // Handle regular messages
    if (update.message) {
      await handleTelegramMessage(update.message)
      return
    }
  } catch (error) {
    console.error("Error handling Telegram update:", error)
    // Don't send error messages to user for unexpected errors
  }
}

/**
 * Handle regular text messages and commands
 */
async function handleTelegramMessage(message: TelegramUpdate["message"]): Promise<void> {
  if (!message) return

  const text = message.text?.trim()
  if (!text) return

  // Handle commands
  if (text.startsWith("/")) {
    const command = text.split(" ")[0].toLowerCase()

    switch (command) {
      case "/start":
        await handleTelegramStart(message)
        break
      case "/help":
        await handleTelegramHelp(message)
        break
      case "/accounts":
        await handleTelegramAccounts(message)
        break
      case "/categories":
        await handleTelegramCategories(message)
        break
      case "/recent":
        await handleTelegramRecent(message)
        break
      case "/add":
        await handleTelegramAdd(message)
        break
      case "/analytics":
        await handleTelegramAnalytics(message)
        break
      case "/cancel":
        await handleTelegramCancel(message)
        break
      case "/link":
        await handleTelegramLink(message)
        break
      default:
        await handleTelegramHelp(message) // Show help for unknown commands
    }
  } else {
    // Handle regular text messages (for conversation flows)
    await handleTelegramText(message)
  }
}
