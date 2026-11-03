import { createNoteListCursor } from "@server/notes/note-list-cursor.ts"
import { config } from "./config.ts"

/** Signs the paging cursors of a group's note list, for REST and the socket alike. */
export const noteListCursor = await createNoteListCursor(config.authCookieSecret)
