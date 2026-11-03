import { Hono } from "hono"
import { createAuth, SessionCookie, type SessionManager } from "@spy4x/server/sign-in"
import type { AuthSessionRecord } from "@spy4x/server/auth"
import { type User, UserMFAStatus } from "@domain/identity"
import type { APIContext } from "../_types.ts"
import type { SignIn } from "../services/sign-in.ts"
import { createMutationGuards } from "../middlewares/mutation-guards.ts"

/** The web app's address as the browser sees it, over TLS. */
export const WEB_APP_URL = "https://app.example.com"
/**
 * The address the API sees for the same request behind the proxy that terminates TLS. Every route
 * test sends its requests here, as production does.
 */
export const API_URL = "http://app.example.com/api"

/** The guards the app builds in `index.ts`, for {@link WEB_APP_URL}. */
export const testMutationGuards = createMutationGuards(WEB_APP_URL)

/**
 * The real `isAuthenticated1FA` and `isAuthenticated2FA` guards, with the app's second-factor rule.
 * They read only `c.get("auth")`, so the session store is never reached.
 */
export function testSessionGuards(): SignIn["auth"] {
  return createAuth<AuthSessionRecord, User>({
    sessions: {} as SessionManager<AuthSessionRecord>,
    cookie: new SessionCookie({ secret: "test-only-cookie-secret-0123456789abcdef" }),
    loadUser: () => Promise.resolve(null),
    hasSecondFactor: (user) => user.mfa === UserMFAStatus.CONFIGURED,
  })
}

/** Headers a browser sends with a `fetch` from the app's own page, session cookie included. */
export const sameOriginHeaders: Readonly<Record<string, string>> = {
  "content-type": "application/json",
  cookie: "sessionIdToken=1:token",
  origin: WEB_APP_URL,
  "sec-fetch-site": "same-origin",
}

/** Headers a browser sends when a page on another site posts to the API with the user's cookie. */
export const crossSiteHeaders: Readonly<Record<string, string>> = {
  "content-type": "application/json",
  cookie: "sessionIdToken=1:token",
  origin: "https://attacker.example",
  "sec-fetch-site": "cross-site",
}

/** {@link sameOriginHeaders} without the session cookie: signed out, or the cookie is gone. */
export const sameOriginWithoutCookieHeaders: Readonly<Record<string, string>> = {
  "content-type": "application/json",
  origin: WEB_APP_URL,
  "sec-fetch-site": "same-origin",
}

/**
 * Mounts `route` at `/api<path>` behind a stand-in for `parseAuth` that sets `auth`: `null` is what
 * `parseAuth` leaves for a missing or expired session.
 */
export function mountRoute(
  path: string,
  route: Hono<APIContext>,
  auth: APIContext["Variables"]["auth"],
): Hono<APIContext> {
  const app = new Hono<APIContext>().basePath("/api")
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test-1")
    c.set("auth", auth)
    await next()
  })
  app.route(path, route)
  return app
}

/** One mutating route and a body that passes its validation, so a passing request reaches it. */
export interface MutationCase {
  method: string
  path: string
  body: unknown
}
