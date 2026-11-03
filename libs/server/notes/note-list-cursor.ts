import { createKeysetCursorCodec, KeysetCursorError } from "@spy4x/platform/keyset-cursor"
import { NoteError, type NoteListPageKey } from "@domain/notes"

/** Signs and verifies the paging cursors of a group's note list. */
export interface NoteListCursor {
  encode(userId: number, groupId: string, pageKey: NoteListPageKey): Promise<string>
  /** @throws {NoteError} `INVALID_CURSOR` for every cursor it refuses. */
  decode(cursor: string, userId: number, groupId: string): Promise<NoteListPageKey>
}

/**
 * The note list's cursor: a keyset cursor under the purpose `notes.list`, bound to the user and the
 * group, so a cursor copied to another account or another group is refused. Every refusal is
 * `NoteError("INVALID_CURSOR")`.
 *
 * @throws {TokenError} When the cookie secret is shorter than 32 printable characters.
 */
export async function createNoteListCursor(cookieSecret: string): Promise<NoteListCursor> {
  const codec = await createKeysetCursorCodec({
    secret: cookieSecret,
    purpose: "notes.list",
    scope: ["userId", "groupId"],
  })
  return {
    encode: (userId, groupId, pageKey) => codec.encode(pageKey, { userId, groupId }),
    async decode(cursor, userId, groupId) {
      try {
        return await codec.decode(cursor, { userId, groupId })
      } catch (error) {
        if (error instanceof KeysetCursorError) {
          throw new NoteError("INVALID_CURSOR", "Note list cursor is invalid")
        }
        throw error
      }
    },
  }
}
