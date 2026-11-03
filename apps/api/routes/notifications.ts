import { Hono } from "hono"
import type { Context, MiddlewareHandler } from "hono"
import {
  NotificationMarkAllReadCommand,
  NotificationMarkReadCommand,
  NotificationUnreadCountQuery,
  parseNotificationId,
  parseNotificationLimit,
} from "@domain/notifications"
import { createSameOriginMutationGuard } from "@spy4x/server/http/same-origin"
import { actorFromAuth } from "../cqrs/actor.ts"
import type { APIContext } from "../_types.ts"
import {
  notificationErrorResponse,
  NotificationFeatureError,
} from "../features/notifications/errors.ts"
import {
  listNotificationsPage,
  type NotificationListDependencies,
} from "../features/notifications/list.ts"

export interface NotificationsRouteDependencies extends NotificationListDependencies {
  unreadCount(query: NotificationUnreadCountQuery): Promise<{ unreadCount: number }>
  markRead(command: NotificationMarkReadCommand): Promise<{ unreadCount: number }>
  markAllRead(command: NotificationMarkAllReadCommand): Promise<{ unreadCount: number }>
  /** The origin the browser sends; see `GroupsRouteDependencies.expectedOrigin`. */
  expectedOrigin?: string
}

/**
 * The REST routes of a person's inbox, mounted at `/api/notifications`. Everything is the signed-in
 * person's own: the actor comes from the session, never from the URL.
 *
 * - `GET /` lists the notifications, newest first: `?limit=1..50&cursor=…`, with `unreadCount`.
 * - `GET /unread-count` answers `{ unreadCount }`, the bell's number.
 * - `POST /:id/read` marks one read; an id that is not the person's is 404, like one that does not
 *   exist.
 * - `POST /read-all` marks every notification read.
 */
export function createNotificationsRoute(
  dependencies: NotificationsRouteDependencies,
): Hono<APIContext> {
  const requireSameOrigin = createSameOriginMutationGuard<APIContext>({
    expectedOrigin: dependencies.expectedOrigin,
    onReject: (c) =>
      notificationErrorResponse(
        c,
        new NotificationFeatureError("REQUEST_ORIGIN_INVALID", "Mutation origin check failed"),
      ),
  })
  return new Hono<APIContext>()
    .onError((error, c) => notificationErrorResponse(c, error))
    .use(requireAuthentication)
    .get("/", async (c) => {
      const page = await listNotificationsPage(dependencies, actorOf(c), {
        limit: parseNotificationLimit(c.req.query("limit")),
        cursor: c.req.query("cursor"),
      })
      return c.json(page)
    })
    .get("/unread-count", async (c) => {
      return c.json(
        await dependencies.unreadCount(
          new NotificationUnreadCountQuery({
            actor: actorOf(c),
          }),
        ),
      )
    })
    .post("/read-all", requireSameOrigin, async (c) => {
      return c.json(
        await dependencies.markAllRead(new NotificationMarkAllReadCommand({ actor: actorOf(c) })),
      )
    })
    .post("/:id/read", requireSameOrigin, async (c) => {
      const id = parseNotificationId(c.req.param("id"))
      return c.json(
        await dependencies.markRead(new NotificationMarkReadCommand({ actor: actorOf(c), id })),
      )
    })
}

/** Authentication only; the session gate on the bus decides whether the session is strong enough. */
const requireAuthentication: MiddlewareHandler<APIContext> = async (c, next) => {
  if (!c.get("auth")) {
    return notificationErrorResponse(
      c,
      new NotificationFeatureError("AUTH_REQUIRED", "Missing session"),
    )
  }
  return await next()
}

function actorOf(c: Context<APIContext>) {
  return actorFromAuth(c.get("auth")!)
}
