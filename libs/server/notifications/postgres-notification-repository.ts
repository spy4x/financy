import type postgres from "postgres"
import type {
  Notification,
  NotificationListResult,
  NotificationPage,
  NotificationPayload,
  NotificationRepository,
} from "@domain/notifications"
import { announceNotificationChange } from "./notification-hint.ts"

interface NotificationRow extends postgres.Row {
  id: string
  kind: string
  payload: NotificationPayload
  link: string
  readAt: Date | null
  createdAt: Date
}

/**
 * A person's inbox in Postgres. Every statement names `user_id`, so one person can neither read nor
 * mark another's notification; an id that is not theirs finds no row, which is the same answer as
 * an id that does not exist. Pages are keyed by id (newest first): the id grows with every insert,
 * so a page never skips or repeats a row the way a timestamp shared by two rows would.
 */
export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async list(userId: number, page: NotificationPage): Promise<NotificationListResult> {
    const limit = Math.max(1, Math.min(100, page.limit))
    const rows = await this.sql<NotificationRow[]>`
      SELECT id::text AS id, kind, payload, link, read_at, created_at
      FROM notifications
      WHERE user_id = ${userId}
        ${page.after ? this.sql`AND id < ${page.after.id}::bigint` : this.sql``}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `
    const shown = rows.slice(0, limit)
    return {
      notifications: shown.map(toNotification),
      nextPageKey: rows.length > limit ? { id: shown[shown.length - 1].id } : null,
      unreadCount: await this.unreadCount(userId),
    }
  }

  async unreadCount(userId: number): Promise<number> {
    const [row] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM notifications
      WHERE user_id = ${userId} AND read_at IS NULL
    `
    return row.count
  }

  /**
   * Marks one read and announces the change, so the person's other tabs update their bell. A
   * notification already read keeps its first `read_at` (the retention clock does not restart) and
   * announces nothing.
   */
  async markRead(userId: number, id: string): Promise<boolean> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const marked = await transaction`
        UPDATE notifications SET read_at = CURRENT_TIMESTAMP
        WHERE id = ${id}::bigint AND user_id = ${userId} AND read_at IS NULL
      `
      if (marked.count > 0) {
        await announceNotificationChange(transaction, userId)
        return true
      }
      const known = await transaction`
        SELECT 1 FROM notifications WHERE id = ${id}::bigint AND user_id = ${userId}
      `
      return known.length > 0
    })
  }

  async markAllRead(userId: number): Promise<void> {
    await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const marked = await transaction`
        UPDATE notifications SET read_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId} AND read_at IS NULL
      `
      if (marked.count > 0) await announceNotificationChange(transaction, userId)
    })
  }
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    link: row.link,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }
}
