import { Hono } from "hono"
import type { Context, MiddlewareHandler } from "hono"
import { isUuid } from "@spy4x/platform/universal/uuid"
import { AccountListQuery, type ListedAccount } from "@domain/accounts"
import { actorFromAuth } from "../cqrs/actor.ts"
import type { APIContext } from "../_types.ts"
import { accountErrorResponse, AccountFeatureError } from "../features/accounts/errors.ts"

export interface AccountsRouteDependencies {
  list(query: AccountListQuery): Promise<{ accounts: ListedAccount[] }>
}

/**
 * The REST route of a household's accounts, mounted at `/api/groups/:groupId/accounts`: the live
 * list with each balance, or the trash with `?deleted=true`. Every account command is an operation
 * (`account.create` and the rest) served by the socket and `POST /api/call/<name>`, so the route
 * has no write. Who may read is decided by the handler, never here.
 */
export function createAccountsRoute(dependencies: AccountsRouteDependencies): Hono<APIContext> {
  return new Hono<APIContext>()
    .onError((error, c) => accountErrorResponse(c, error))
    .use(requireAuthentication)
    .get("/", async (c) => {
      const result = await dependencies.list(
        new AccountListQuery({
          actor: actorFromAuth(c.get("auth")!),
          groupId: groupIdOf(c),
          deleted: c.req.query("deleted") === "true",
        }),
      )
      return c.json(result)
    })
}

/** Authentication only; the session gate on the bus decides whether the session is strong enough. */
const requireAuthentication: MiddlewareHandler<APIContext> = async (c, next) => {
  if (!c.get("auth")) {
    return accountErrorResponse(c, new AccountFeatureError("AUTH_REQUIRED", "Missing session"))
  }
  return await next()
}

function groupIdOf(c: Context<APIContext>): string {
  const groupId = c.req.param("groupId")
  if (!isUuid(groupId)) throw new AccountFeatureError("INVALID_REQUEST", "Group id is invalid")
  return groupId
}
