import type { CommandHandler } from "@spy4x/platform/cqrs"
import type {
  NotificationMarkAllReadCommand,
  NotificationMarkReadCommand,
} from "@domain/notifications"
import { db } from "../../services/db.ts"
import {
  createNotificationMarkAllReadHandler,
  createNotificationMarkReadHandler,
} from "../../features/notifications/handlers.ts"

export const notificationMarkReadHandler: CommandHandler<NotificationMarkReadCommand> =
  createNotificationMarkReadHandler(db.notification)

export const notificationMarkAllReadHandler: CommandHandler<NotificationMarkAllReadCommand> =
  createNotificationMarkAllReadHandler(db.notification)
