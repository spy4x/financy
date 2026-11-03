import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import { parseGroupId } from "@domain/groups"
import { actorFromAuth } from "../cqrs/actor.ts"
import type { APIContext } from "../_types.ts"
import { groupErrorResponse, GroupFeatureError } from "../features/groups/errors.ts"
import {
  type GroupActivityDependencies,
  listActivityPage,
  parseActivityLimitParam,
} from "../features/groups/activity.ts"

export type GroupActivityRouteDependencies = GroupActivityDependencies

/**
 * The REST route of a group's activity log, mounted at `/api/groups/:groupId/activity`:
 * `GET /` lists the events, newest first: `?limit=1..100&cursor=…`. Like the other routes it
 * parses, names the actor from the session and dispatches on the query bus; that only an admin or
 * the owner may read it is decided by the handler, never here.
 */
export function createGroupActivityRoute(
  dependencies: GroupActivityRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .onError((error, c) => groupErrorResponse(c, error))
    .use(requireAuthentication)
    .get("/", async (c) => {
      const page = await listActivityPage(
        dependencies,
        actorFromAuth(c.get("auth")!),
        parseGroupId(c.req.param("groupId")),
        { limit: parseActivityLimitParam(c.req.query("limit")), cursor: c.req.query("cursor") },
      )
      return c.json(page)
    })
}

/** Authentication only; the session gate on the bus decides whether the session is strong enough. */
const requireAuthentication: MiddlewareHandler<APIContext> = async (c, next) => {
  if (!c.get("auth")) {
    return groupErrorResponse(c, new GroupFeatureError("AUTH_REQUIRED", "Missing session"))
  }
  return await next()
}
