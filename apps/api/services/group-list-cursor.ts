import { createGroupListCursor } from "@server/groups/group-list-cursor.ts"
import { config } from "./config.ts"

/** Signs the paging cursors of the group list, for REST and the socket alike. */
export const groupListCursor = await createGroupListCursor(config.authCookieSecret)
