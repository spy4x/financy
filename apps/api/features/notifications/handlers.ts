import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  NotificationError,
  type NotificationListQuery,
  type NotificationMarkAllReadCommand,
  type NotificationMarkReadCommand,
  type NotificationRepository,
  type NotificationUnreadCountQuery,
} from "@domain/notifications"

/**
 * Every handler here reads the person from the actor and passes only that id to the repository,
 * which scopes each statement by it: there is no way to ask for, or mark, another person's
 * notification. No group role is involved: an inbox belongs to one person.
 */
export function createNotificationListHandler(
  notifications: Pick<NotificationRepository, "list">,
): QueryHandler<NotificationListQuery> {
  return async ({ data }) => await notifications.list(data.actor.userId, data.page)
}

export function createNotificationUnreadCountHandler(
  notifications: Pick<NotificationRepository, "unreadCount">,
): QueryHandler<NotificationUnreadCountQuery> {
  return async ({ data }) => ({ unreadCount: await notifications.unreadCount(data.actor.userId) })
}

/**
 * Marks one of the actor's notifications read. An id that is not theirs and an id that does not
 * exist both answer `NOTIFICATION_NOT_FOUND`, so the answer never says which ids are taken.
 */
export function createNotificationMarkReadHandler(
  notifications: Pick<NotificationRepository, "markRead" | "unreadCount">,
): CommandHandler<NotificationMarkReadCommand> {
  return async ({ data }) => {
    if (!await notifications.markRead(data.actor.userId, data.id)) {
      throw new NotificationError("NOTIFICATION_NOT_FOUND", "Notification not found")
    }
    return { unreadCount: await notifications.unreadCount(data.actor.userId) }
  }
}

export function createNotificationMarkAllReadHandler(
  notifications: Pick<NotificationRepository, "markAllRead" | "unreadCount">,
): CommandHandler<NotificationMarkAllReadCommand> {
  return async ({ data }) => {
    await notifications.markAllRead(data.actor.userId)
    return { unreadCount: await notifications.unreadCount(data.actor.userId) }
  }
}
