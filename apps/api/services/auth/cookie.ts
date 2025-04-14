import { deleteCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie"
import { USER_ID_COOKIE_NAME } from "$shared/types"
import { config } from "../config.ts"
import { Context } from "hono"
import { SESSION_ID_COOKIE_NAME } from "./types.ts"

export class CookieManager {
  async getSessionIdToken(context: Context): Promise<string | null> {
    return (await getSignedCookie(context, config.authCookieSecret, SESSION_ID_COOKIE_NAME)) ||
      null
  }

  async set(
    context: Context,
    userId: number | string,
    sessionIdToken: string,
    expiresAt?: Date,
  ): Promise<void> {
    const maxAge = expiresAt ? expiresAt.getTime() - Date.now() : config.authSessionDurationMin * 60
    await setSignedCookie(
      context,
      SESSION_ID_COOKIE_NAME,
      sessionIdToken,
      config.authCookieSecret,
      {
        path: "/",
        maxAge,
        expires: expiresAt,
        httpOnly: true,
        sameSite: "lax",
        secure: !config.isDev,
      },
    )
    // set js-accessible cookie with user.id
    setCookie(context, USER_ID_COOKIE_NAME, userId.toString(), {
      path: "/",
      maxAge,
      expires: expiresAt,
      httpOnly: false,
      sameSite: "lax",
      secure: !config.isDev,
    })
  }

  invalidate(context: Context): void {
    // remove session cookie
    deleteCookie(context, SESSION_ID_COOKIE_NAME)

    // remove js-accessible userId cookie
    deleteCookie(context, USER_ID_COOKIE_NAME)
  }
}
