import type postgres from "postgres"
import { listenForNotificationChanges } from "@server/notifications/notification-hint.ts"
import type { Realtime } from "./realtime.ts"

/** The part of {@link Realtime} the inbox listener calls. */
export type InboxNewsTarget = Pick<Realtime, "notifyUserChange">

/**
 * Turns an inbox change announced by Postgres into a hint on the person's open sockets, and returns
 * a function that stops listening. The hint carries no count: the page reads the unread count over
 * REST, so the badge is always what the server holds. The API calls it once at start-up.
 */
export function listenForInboxNews(
  sql: postgres.Sql,
  realtime: InboxNewsTarget,
): Promise<() => Promise<void>> {
  return listenForNotificationChanges(sql, ({ userId }) => {
    realtime.notifyUserChange(userId)
  })
}
