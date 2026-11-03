import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupError } from "@domain/groups"
import { createKeysetCursorCodec } from "@spy4x/platform/keyset-cursor"
import { createActivityCursor } from "./activity-cursor.ts"
import { createGroupListCursor } from "./group-list-cursor.ts"

const secret = "activity-cursor-test-secret-0123456789"
const groupId = "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111002"
const otherGroupId = "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111003"

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  const error = await promise.then(() => null, (caught) => caught)
  return error instanceof GroupError ? error.code : error === null ? null : String(error)
}

describe("activity cursor", () => {
  it("round-trips a page key for the same user and group", async () => {
    const codec = await createActivityCursor(secret)
    const cursor = await codec.encode(7, groupId, { id: "9007199254740993" })

    expect(await codec.decode(cursor, 7, groupId)).toEqual({ id: "9007199254740993" })
  })

  it("refuses a cursor handed to another user or another group", async () => {
    const codec = await createActivityCursor(secret)
    const cursor = await codec.encode(7, groupId, { id: "12" })

    expect(await codeOf(codec.decode(cursor, 8, groupId))).toBe("INVALID_CURSOR")
    expect(await codeOf(codec.decode(cursor, 7, otherGroupId))).toBe("INVALID_CURSOR")
  })

  it("refuses a group list cursor and a tampered one", async () => {
    const codec = await createActivityCursor(secret)
    const listCursor = await (await createGroupListCursor(secret)).encode(7, {
      updatedAt: new Date("2026-08-18T10:00:00.000Z"),
      id: "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111001",
    })
    const cursor = await codec.encode(7, groupId, { id: "12" })

    expect(await codeOf(codec.decode(listCursor, 7, groupId))).toBe("INVALID_CURSOR")
    expect(await codeOf(codec.decode(`${cursor.slice(0, -2)}AA`, 7, groupId))).toBe(
      "INVALID_CURSOR",
    )
  })

  it("refuses a signed page key whose id is not a number", async () => {
    const forged = await createKeysetCursorCodec({
      secret,
      purpose: "groups.activity",
      scope: ["userId", "groupId"],
    })
    const cursor = await forged.encode(
      {
        updatedAt: new Date("2026-08-18T10:00:00.000Z"),
        id: "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111001",
      },
      { userId: 7, groupId },
    )

    expect(await codeOf((await createActivityCursor(secret)).decode(cursor, 7, groupId))).toBe(
      "INVALID_CURSOR",
    )
  })
})
