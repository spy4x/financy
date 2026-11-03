import { createKeysetCursorCodec, KeysetCursorError } from "@spy4x/platform/keyset-cursor"
import { GroupError, type GroupListPageKey } from "@domain/groups"

/** Signs and verifies the paging cursors of the group list. */
export interface GroupListCursor {
  encode(userId: number, pageKey: GroupListPageKey): Promise<string>
  /** @throws {GroupError} `INVALID_CURSOR` for every cursor it refuses. */
  decode(cursor: string, expectedUserId: number): Promise<GroupListPageKey>
}

/**
 * The group list's cursor: a keyset cursor under the purpose `groups.list`, bound to the signed-in
 * user, so a cursor copied to another account is refused. Every refusal is
 * `GroupError("INVALID_CURSOR")`.
 *
 * @throws {TokenError} When the cookie secret is shorter than 32 printable characters.
 */
export async function createGroupListCursor(cookieSecret: string): Promise<GroupListCursor> {
  const codec = await createKeysetCursorCodec({
    secret: cookieSecret,
    purpose: "groups.list",
    scope: ["userId"],
  })
  return {
    encode: (userId, pageKey) => codec.encode(pageKey, { userId }),
    async decode(cursor, expectedUserId) {
      try {
        return await codec.decode(cursor, { userId: expectedUserId })
      } catch (error) {
        if (error instanceof KeysetCursorError) {
          throw new GroupError("INVALID_CURSOR", "Group list cursor is invalid")
        }
        throw error
      }
    },
  }
}
