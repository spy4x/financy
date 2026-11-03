import { createActivityCursor } from "@server/groups/activity-cursor.ts"
import { config } from "./config.ts"

/** Signs the paging cursors of a group's activity log. */
export const activityCursor = await createActivityCursor(config.authCookieSecret)
