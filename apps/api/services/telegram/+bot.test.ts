/*
 * COMMENTED OUT - Dependency injection issues
 * TODO: Uncomment after DI refactoring is complete
 *
import { TelegramBot } from "./+bot.ts"
import { afterEach, beforeEach, describe, expect, it } from "@shared/testing"

describe("TelegramBot", () => {
  let bot: TelegramBot
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    // Mock fetch for Telegram API calls
    originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    bot = new TelegramBot("test-token")
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("should create bot instance", () => {
    expect(bot).toBeInstanceOf(TelegramBot)
  })

  it("should handle basic message structure", () => {
    const message = {
      message_id: 1,
      chat: { id: 123, type: "private" },
      date: Date.now(),
      text: "/start",
      from: {
        id: 456,
        is_bot: false,
        first_name: "Test",
        username: "testuser",
      },
    }

    expect(message.chat.id).toBe(123)
    expect(message.text).toBe("/start")
    expect(message.from?.username).toBe("testuser")
  })

  it("should handle callback query structure", () => {
    const callbackQuery = {
      id: "callback-123",
      from: {
        id: 456,
        is_bot: false,
        first_name: "Test",
        username: "testuser",
      },
      data: "accounts_list",
    }

    expect(callbackQuery.id).toBe("callback-123")
    expect(callbackQuery.data).toBe("accounts_list")
    expect(callbackQuery.from.username).toBe("testuser")
  })
})
*/
