import type { QueryHandler } from "@spy4x/platform/cqrs"
import type { NotificationListQuery, NotificationUnreadCountQuery } from "@domain/notifications"
import { db } from "../../services/db.ts"
import {
  createNotificationListHandler,
  createNotificationUnreadCountHandler,
} from "../../features/notifications/handlers.ts"

export const notificationListHandler: QueryHandler<NotificationListQuery> =
  createNotificationListHandler(db.notification)

export const notificationUnreadCountHandler: QueryHandler<NotificationUnreadCountQuery> =
  createNotificationUnreadCountHandler(db.notification)
