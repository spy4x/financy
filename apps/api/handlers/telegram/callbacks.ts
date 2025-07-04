/**
 * Telegram Callbacks Handler - Clean Implementation
 *
 * This file provides callback parsing utilities and delegates all business logic
 * to the main updates handler. In the new architecture, all callback handling
 * is centralized in updates.ts for better maintainability.
 */

import type { TelegramUpdate } from "@api/services/telegram/+bot.ts"
import { handleTelegramUpdate } from "./updates.ts"

/**
 * Parse callback data to extract action and parameters
 */
export function parseCallbackData(data: string): {
  prefix: string
  action: string
  params: string[]
} {
  const parts = data.split("_")
  const prefix = parts[0] || ""
  const action = parts[1] || ""
  const params = parts.slice(2)

  return { prefix, action, params }
}

/**
 * Check if callback data has a specific prefix
 */
export function hasCallbackPrefix(data: string, prefix: string): boolean {
  return data.startsWith(`${prefix}_`)
}

/**
 * Handle telegram callback query (delegates to main update handler)
 *
 * This function is provided for backward compatibility, but the recommended
 * approach is to use handleTelegramUpdate directly from updates.ts
 */
export async function handleTelegramCallback(
  callbackQuery: TelegramUpdate["callback_query"],
): Promise<void> {
  if (!callbackQuery) return

  // Delegate to main update handler
  await handleTelegramUpdate({
    update_id: Date.now(), // Temporary ID for routing
    callback_query: callbackQuery,
  })
}

/**
 * Get supported callback prefixes and their descriptions
 */
export function getSupportedCallbackPrefixes(): Array<{ prefix: string; description: string }> {
  return [
    { prefix: "menu", description: "Main menu navigation actions" },
    { prefix: "tx", description: "Transaction-related actions" },
    { prefix: "account", description: "Account selection and management" },
    { prefix: "category", description: "Category selection and management" },
    { prefix: "cancel", description: "Cancel current operation" },
    { prefix: "noop", description: "No-operation (for pagination indicators)" },
  ]
}

/**
 * Validate callback data format
 */
export function isValidCallbackData(data: string): boolean {
  if (!data || data.length === 0) return false

  // Special cases
  if (data === "cancel" || data === "noop") return true

  // Must follow prefix_action format
  const parts = data.split("_")
  return parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0
}

/**
 * Extract callback type from data
 */
export function getCallbackType(data: string): string {
  if (data === "cancel" || data === "noop") return data

  const { prefix } = parseCallbackData(data)
  return prefix
}

// Note: In the new architecture, individual callback handler functions
// (like handleMenuCallback, handleTransactionCallback, etc.) are implemented
// directly in updates.ts as internal functions. This promotes better
// code organization and reduces the API surface area.
//
// The callback parsing utilities in this file can be used for testing
// or if you need to analyze callback data structure programmatically.
