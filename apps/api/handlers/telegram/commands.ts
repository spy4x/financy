/**
 * Telegram Commands Handler - Clean Implementation
 *
 * This file provides command parsing utilities and delegates all business logic
 * to the main updates handler. In the new architecture, all command handling
 * is centralized in updates.ts for better maintainability.
 */

import type { TelegramUpdate } from "@api/services/telegram/+bot.ts"
import { handleTelegramUpdate } from "./updates.ts"

/**
 * Parse command from message text
 */
export function parseCommand(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(" ")
  const command = parts[0].toLowerCase()
  const args = parts.slice(1)

  return { command, args }
}

/**
 * Check if text is a command
 */
export function isCommand(text?: string): boolean {
  return !!text?.startsWith("/")
}

/**
 * Handle telegram command (delegates to main update handler)
 *
 * This function is provided for backward compatibility, but the recommended
 * approach is to use handleTelegramUpdate directly from updates.ts
 */
export async function handleTelegramCommand(message: TelegramUpdate["message"]): Promise<void> {
  if (!message) return

  // Delegate to main update handler
  await handleTelegramUpdate({
    update_id: Date.now(), // Temporary ID for routing
    message,
  })
}

/**
 * Get essential commands list
 */
export function getAvailableCommands(): Array<{ command: string; description: string }> {
  return [
    { command: "/start", description: "Initialize bot and show main menu" },
    { command: "/cancel", description: "Cancel current operation" },
    { command: "/skip", description: "Skip memo input during transactions" },
    { command: "/link", description: "Link Telegram account with Financy" },
  ]
}

/**
 * Validate command arguments
 */
export function validateCommandArgs(command: string, args: string[]): boolean {
  switch (command) {
    case "/link":
      return args.length === 1 && args[0].length > 0
    case "/start":
    case "/cancel":
    case "/skip":
      return true // These commands don't require arguments
    default:
      return false // Unknown command
  }
}

// Note: In the new architecture, individual command handler functions
// are implemented directly in updates.ts as internal functions. Most
// functionality is now accessed through buttons rather than commands
// for better user experience and discoverability.
//
// Only essential commands (/start, /cancel, /skip, /link) are supported.
// All other features are available through the button interface.
//
// If you need to call specific functionality programmatically,
// consider using the CQRS layer directly or the TelegramBot service
// methods instead of individual command functions.
