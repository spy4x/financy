import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupError } from "@domain/groups"
import { createGroupListCursor } from "./group-list-cursor.ts"

const secret = "group-list-cursor-test-secret-0123456789"
const pageKey = {
  updatedAt: new Date("2026-08-18T10:00:00.000Z"),
  id: "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111001",
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  const error = await promise.then(() => null, (caught) => caught)
  return error instanceof GroupError ? error.code : error === null ? null : String(error)
}

describe("group list cursor", () => {
  it("round-trips a page key for the same user", async () => {
    const codec = await createGroupListCursor(secret)

    expect(await codec.decode(await codec.encode(7, pageKey), 7)).toEqual(pageKey)
  })

  it("refuses a cursor handed to another user with INVALID_CURSOR", async () => {
    const codec = await createGroupListCursor(secret)
    const cursor = await codec.encode(7, pageKey)

    expect(await codeOf(codec.decode(cursor, 8))).toBe("INVALID_CURSOR")
  })

  it("refuses a tampered cursor with INVALID_CURSOR", async () => {
    const codec = await createGroupListCursor(secret)
    const cursor = await codec.encode(7, pageKey)
    const tampered = cursor.slice(0, -2) + (cursor.endsWith("AA") ? "BB" : "AA")

    expect(await codeOf(codec.decode(tampered, 7))).toBe("INVALID_CURSOR")
  })
})
