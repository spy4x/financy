import { type NoteListPageKey, NoteListQuery, type NoteListResult } from "@domain/notes"
import type { Actor } from "@domain/identity"

/** What listing notes needs from the app. */
export interface NoteListDependencies {
  list(query: NoteListQuery): Promise<NoteListResult>
  cursor: {
    encode(userId: number, groupId: string, pageKey: NoteListPageKey): Promise<string>
    decode(cursor: string, userId: number, groupId: string): Promise<NoteListPageKey>
  }
}

/** The page size when a list names none. */
export const DEFAULT_NOTE_LIST_LIMIT = 50

/**
 * One page of a group's notes, in the shape `GET /api/groups/:groupId/notes` answers with. The
 * REST route and the socket both call it, so the two cannot drift apart.
 */
export async function listNotesPage(
  dependencies: NoteListDependencies,
  actor: Actor,
  groupId: string,
  page: { limit: number; cursor?: string; deleted?: boolean },
) {
  const after = page.cursor
    ? await dependencies.cursor.decode(page.cursor, actor.userId, groupId)
    : undefined
  const result = await dependencies.list(
    new NoteListQuery({
      actor,
      groupId,
      page: { limit: page.limit, after },
      deleted: page.deleted,
    }),
  )
  const nextCursor = result.nextPageKey
    ? await dependencies.cursor.encode(actor.userId, groupId, result.nextPageKey)
    : null
  return { notes: result.notes, nextCursor }
}
