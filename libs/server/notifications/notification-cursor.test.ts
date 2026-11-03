import { type } from "arktype"
import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { NotificationError } from "@domain/notifications"
import { createKeysetCursorCodec } from "@spy4x/platform/keyset-cursor"
import { createNotificationCursor } from "./notification-cursor.ts"

const secret = "notification-cursor-test-secret-0123456789"

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  const error = await promise.then(() => null, (caught) => caught)
  return error instanceof NotificationError ? error.code : error === null ? null : String(error)
}

describe("notification cursor", () => {
  it("round-trips a page key for the same user", async () => {
    const codec = await createNotificationCursor(secret)
    const cursor = await codec.encode(7, { id: "9007199254740993" })

    expect(await codec.decode(cursor, 7)).toEqual({ id: "9007199254740993" })
  })

  it("refuses a cursor handed to another user", async () => {
    const codec = await createNotificationCursor(secret)
    const cursor = await codec.encode(7, { id: "12" })

    expect(await codeOf(codec.decode(cursor, 8))).toBe("INVALID_CURSOR")
  })

  it("refuses a tampered cursor and one signed for another purpose", async () => {
    const codec = await createNotificationCursor(secret)
    const cursor = await codec.encode(7, { id: "12" })
    const other = await createKeysetCursorCodec({
      secret,
      purpose: "groups.activity",
      scope: ["userId"],
      pageKey: type({ id: "string" }),
    })
    const foreign = await other.encode({ id: "12" }, { userId: 7 })

    expect(await codeOf(codec.decode(`${cursor.slice(0, -2)}AA`, 7))).toBe("INVALID_CURSOR")
    expect(await codeOf(codec.decode(foreign, 7))).toBe("INVALID_CURSOR")
  })

  it("refuses a signed page key whose id is not a number", async () => {
    const forged = await createKeysetCursorCodec({
      secret,
      purpose: "notifications.inbox",
      scope: ["userId"],
      pageKey: type({ id: "string" }),
    })
    const cursor = await forged.encode({ id: "not-a-number" }, { userId: 7 })

    expect(await codeOf((await createNotificationCursor(secret)).decode(cursor, 7))).toBe(
      "INVALID_CURSOR",
    )
  })
})
