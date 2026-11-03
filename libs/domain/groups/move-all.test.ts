/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  assertCanMoveGroupData,
  type GroupError,
  GroupRole,
  parseMoveAllBody,
  parseMoveAllRequest,
} from "./+lib.ts"

const FROM = "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111002"
const TO = "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111003"

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    return (error as GroupError).code
  }
}

Deno.test("move all: the body names exactly the target group", () => {
  expect(parseMoveAllBody({ toGroupId: TO }, FROM)).toEqual({ toGroupId: TO })
  expect(codeOf(() => parseMoveAllBody({}, FROM))).toBe("INVALID_REQUEST")
  expect(codeOf(() => parseMoveAllBody({ toGroupId: TO, extra: 1 }, FROM))).toBe(
    "INVALID_REQUEST",
  )
  expect(codeOf(() => parseMoveAllBody({ toGroupId: "nope" }, FROM))).toBe("INVALID_REQUEST")
  expect(codeOf(() => parseMoveAllBody(null, FROM))).toBe("INVALID_REQUEST")
})

Deno.test("move all: a move into the same group is refused", () => {
  expect(codeOf(() => parseMoveAllBody({ toGroupId: FROM }, FROM))).toBe("SAME_GROUP")
  expect(codeOf(() => parseMoveAllRequest({ groupId: FROM, toGroupId: FROM }))).toBe(
    "SAME_GROUP",
  )
})

Deno.test("move all: the socket payload names both groups and nothing else", () => {
  expect(parseMoveAllRequest({ groupId: FROM, toGroupId: TO })).toEqual({
    groupId: FROM,
    toGroupId: TO,
  })
  expect(codeOf(() => parseMoveAllRequest({ toGroupId: TO }))).toBe("INVALID_REQUEST")
  expect(codeOf(() => parseMoveAllRequest({ groupId: FROM, toGroupId: TO, x: 1 }))).toBe(
    "INVALID_REQUEST",
  )
})

Deno.test("move all: an editor or above may move data, a viewer may not, a stranger sees no group", () => {
  expect(codeOf(() => assertCanMoveGroupData(GroupRole.EDITOR))).toBeUndefined()
  expect(codeOf(() => assertCanMoveGroupData(GroupRole.OWNER))).toBeUndefined()
  expect(codeOf(() => assertCanMoveGroupData(GroupRole.VIEWER))).toBe("ROLE_INSUFFICIENT")
  expect(codeOf(() => assertCanMoveGroupData(null))).toBe("GROUP_NOT_FOUND")
})
