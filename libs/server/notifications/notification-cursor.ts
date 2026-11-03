import { type } from "arktype"
import { createKeysetCursorCodec, KeysetCursorError } from "@spy4x/platform/keyset-cursor"
import { NotificationError, type NotificationPageKey } from "@domain/notifications"

/** Signs and verifies the paging cursors of a person's inbox. */
export interface NotificationCursor {
  encode(userId: number, pageKey: NotificationPageKey): Promise<string>
  /** @throws {NotificationError} `INVALID_CURSOR` for every cursor it refuses. */
  decode(cursor: string, userId: number): Promise<NotificationPageKey>
}

/** The page key: the id of the last notification of a page, a positive bigint in decimal. */
const pageKeySchema = type({ "id": /^[1-9][0-9]{0,18}$/, "+": "reject" })

/**
 * The inbox's cursor: a keyset cursor under the purpose `notifications.inbox`, bound to the user,
 * so a cursor copied to another account is refused. Every refusal is
 * `NotificationError("INVALID_CURSOR")`.
 *
 * @throws {TokenError} When the cookie secret is shorter than 32 printable characters.
 */
export async function createNotificationCursor(cookieSecret: string): Promise<NotificationCursor> {
  const codec = await createKeysetCursorCodec({
    secret: cookieSecret,
    purpose: "notifications.inbox",
    scope: ["userId"],
    pageKey: pageKeySchema,
  })
  return {
    encode: (userId, pageKey) => codec.encode(pageKey, { userId }),
    async decode(cursor, userId) {
      try {
        return await codec.decode(cursor, { userId })
      } catch (error) {
        if (error instanceof KeysetCursorError) {
          throw new NotificationError("INVALID_CURSOR", "Notification cursor is invalid")
        }
        throw error
      }
    },
  }
}
