import { Hono } from "hono"
import type { Context, MiddlewareHandler } from "hono"
import { isUuid } from "@spy4x/platform/universal/uuid"
import { type Category, CategoryListQuery } from "@domain/categories"
import { actorFromAuth } from "../cqrs/actor.ts"
import type { APIContext } from "../_types.ts"
import { categoryErrorResponse, CategoryFeatureError } from "../features/categories/errors.ts"

export interface CategoriesRouteDependencies {
  list(query: CategoryListQuery): Promise<{ categories: Category[] }>
}

/**
 * The REST route of a household's categories, mounted at `/api/groups/:groupId/categories`: every
 * category, archived ones included, in one page. Every category command is an operation
 * (`category.create` and the rest) served by the socket and `POST /api/call/<name>`, so the route
 * has no write. Who may read is decided by the handler, never here.
 */
export function createCategoriesRoute(dependencies: CategoriesRouteDependencies): Hono<APIContext> {
  return new Hono<APIContext>()
    .onError((error, c) => categoryErrorResponse(c, error))
    .use(requireAuthentication)
    .get("/", async (c) => {
      const result = await dependencies.list(
        new CategoryListQuery({ actor: actorFromAuth(c.get("auth")!), groupId: groupIdOf(c) }),
      )
      return c.json(result)
    })
}

/** Authentication only; the session gate on the bus decides whether the session is strong enough. */
const requireAuthentication: MiddlewareHandler<APIContext> = async (c, next) => {
  if (!c.get("auth")) {
    return categoryErrorResponse(c, new CategoryFeatureError("AUTH_REQUIRED", "Missing session"))
  }
  return await next()
}

function groupIdOf(c: Context<APIContext>): string {
  const groupId = c.req.param("groupId")
  if (!isUuid(groupId)) throw new CategoryFeatureError("INVALID_REQUEST", "Group id is invalid")
  return groupId
}
