import { Context, Next } from "hono"
import { createMiddleware } from "hono/factory"
import { auth } from "$api/services/auth/+index.ts"
import { APIContext } from "../_types.ts"
import { SessionMFAStatus, UserRole } from "@shared/types"

export const parseAuth = createMiddleware<APIContext>(async (c, next) => {
  const authData = await auth.getForRequest(c)
  c.set("auth", authData!)
  return next()
})

export const isAuthenticated1FA = createMiddleware<APIContext>(
  async (c: Context, next: Next) => {
    const auth = c.get("auth")
    if (!auth) {
      return c.json({ error: "Not authenticated" }, 401)
    }
    return next()
  },
)

export const isAuthenticated2FA = createMiddleware<APIContext>(
  async (c: Context, next: Next) => {
    const auth = c.get("auth")
    if (!auth) {
      return c.json({ error: "Not authenticated" }, 401)
    }
    if (auth.session.mfa === SessionMFAStatus.NOT_PASSED_YET) {
      return c.json({ error: "Need to pass 2FA" }, 401)
    }
    return next()
  },
)

export const isRole = (...roles: UserRole[]) => {
  return createMiddleware<APIContext>(async (c: Context, next: Next) => {
    const authData = c.get("auth")
    if (!authData) {
      return c.json({ error: "Not authenticated" }, 401)
    }
    if (!roles.includes(authData.user.role)) {
      return c.json({ error: "Not authorized" }, 403)
    }
    return next()
  })
}
