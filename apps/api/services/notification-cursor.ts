import { createNotificationCursor } from "@server/notifications/notification-cursor.ts"
import { config } from "./config.ts"

/** Signs the paging cursors of a person's inbox. */
export const notificationCursor = await createNotificationCursor(config.authCookieSecret)
