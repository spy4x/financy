import { type } from "arktype"
import { createKeysetCursorCodec, KeysetCursorError } from "@spy4x/platform/keyset-cursor"
import { type ActivityPageKey, GroupError } from "@domain/groups"

/** Signs and verifies the paging cursors of a group's activity log. */
export interface ActivityCursor {
  encode(userId: number, groupId: string, pageKey: ActivityPageKey): Promise<string>
  /** @throws {GroupError} `INVALID_CURSOR` for every cursor it refuses. */
  decode(cursor: string, userId: number, groupId: string): Promise<ActivityPageKey>
}

/** The page key: the id of the last event of a page, a positive bigint in decimal. */
const pageKeySchema = type({ "id": /^[1-9][0-9]{0,18}$/, "+": "reject" })

/**
 * The activity log's cursor: a keyset cursor under the purpose `groups.activity`, bound to the
 * user and the group, so a cursor copied to another account or another group is refused. Every
 * refusal is `GroupError("INVALID_CURSOR")`.
 *
 * @throws {TokenError} When the cookie secret is shorter than 32 printable characters.
 */
export async function createActivityCursor(cookieSecret: string): Promise<ActivityCursor> {
  const codec = await createKeysetCursorCodec({
    secret: cookieSecret,
    purpose: "groups.activity",
    scope: ["userId", "groupId"],
    pageKey: pageKeySchema,
  })
  return {
    encode: (userId, groupId, pageKey) => codec.encode(pageKey, { userId, groupId }),
    async decode(cursor, userId, groupId) {
      try {
        return await codec.decode(cursor, { userId, groupId })
      } catch (error) {
        if (error instanceof KeysetCursorError) {
          throw new GroupError("INVALID_CURSOR", "Activity cursor is invalid")
        }
        throw error
      }
    },
  }
}
