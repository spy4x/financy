import {
  type Notification,
  type NotificationListQuery,
  NotificationListQuery as ListQuery,
  type NotificationListResult,
  type NotificationPageKey,
} from "@domain/notifications"
import type { Actor } from "@domain/identity"

/** What listing the inbox needs from the app. */
export interface NotificationListDependencies {
  list(query: NotificationListQuery): Promise<NotificationListResult>
  cursor: {
    encode(userId: number, pageKey: NotificationPageKey): Promise<string>
    decode(cursor: string, userId: number): Promise<NotificationPageKey>
  }
}

/** One page of the inbox in the shape `GET /api/notifications` answers with. */
export interface NotificationPageResult {
  notifications: Notification[]
  nextCursor: string | null
  unreadCount: number
}

/** One page of the actor's inbox: the REST route and the tests both call it. */
export async function listNotificationsPage(
  dependencies: NotificationListDependencies,
  actor: Actor,
  page: { limit: number; cursor?: string },
): Promise<NotificationPageResult> {
  const after = page.cursor
    ? await dependencies.cursor.decode(page.cursor, actor.userId)
    : undefined
  const result = await dependencies.list(
    new ListQuery({ actor, page: { limit: page.limit, after } }),
  )
  return {
    notifications: result.notifications,
    nextCursor: result.nextPageKey
      ? await dependencies.cursor.encode(actor.userId, result.nextPageKey)
      : null,
    unreadCount: result.unreadCount,
  }
}
