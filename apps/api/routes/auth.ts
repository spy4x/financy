import { Hono } from "hono"
import {
  authOTPSchema,
  authPasswordChangeSchema,
  authUsernamePasswordSchema,
  SessionMFAStatus,
} from "$shared/types"
import { auth } from "$api/services"
import { APIContext } from "../_types.ts"
import { isAuthenticated1FA, isAuthenticated2FA } from "../middlewares/auth.ts"
import { rateLimiter, strictRateLimiter } from "../middlewares/rateLimiter.ts"

export const authRoute = new Hono<APIContext>()
  .post(`/sign-out`, async (c) => {
    await auth.signOut(c)
    return c.json({ success: true })
  })
  .use(strictRateLimiter)
  .post(`password/check`, async (c) => {
    const parseResult = authUsernamePasswordSchema.safeParse(await c.req.json())
    if (!parseResult.success) {
      return c.json(parseResult.error, 400)
    }
    const { username, password } = parseResult.data
    const authData = await auth.signInWithPassword(username, password, c)
    if (!authData) {
      return c.json({ error: "Invalid username or password" }, 401)
    }
    return c.json(
      authData.user,
      authData.session.mfa === SessionMFAStatus.NOT_PASSED_YET ? 202 : 200,
    )
  })
  .use(isAuthenticated1FA)
  .post(`/totp/check`, async (c) => {
    const authData = c.get("auth")
    if (!authData) {
      return c.json({ error: "User not signed in" }, 401)
    }
    const parseResult = authOTPSchema.safeParse(await c.req.json())
    if (!parseResult.success) {
      return c.json(parseResult.error, 400)
    }
    const isSuccess = await auth.checkTOTP(authData, parseResult.data.otp)
    if (!isSuccess) {
      return c.json({ error: "Invalid token" }, 401)
    }
    return c.json(authData.user)
  })
  .post(`/totp/connect/start`, async (c) => {
    const authData = c.get("auth")
    const { error, qrcode, secret } = await auth.connectTOTPStart(authData)
    if (error) {
      return c.json({ error }, 400)
    }
    return c.json({ qrcode, secret })
  })
  .post(`/totp/connect/finish`, async (c) => {
    const authData = c.get("auth")
    const parseResult = authOTPSchema.safeParse(await c.req.json())
    if (!parseResult.success) {
      return c.json(parseResult.error, 400)
    }
    const isSuccess = await auth.connectTOTPFinish(authData, parseResult.data.otp)
    if (!isSuccess) {
      return c.json({ error: "Code is incorrect" }, 400)
    }
    return c.json({ success: true })
  })
  .use(rateLimiter)
  .use(isAuthenticated2FA)
  .post(`/totp/disconnect`, async (c) => {
    const isSuccess = await auth.disconnectTOTP(c.get("auth"))
    if (!isSuccess) {
      return c.json({ error: "OTP already disabled for your account" }, 400)
    }
    return c.json({ success: true })
  })
  .post(`/password/change`, async (c) => {
    const parseResult = authPasswordChangeSchema.safeParse(await c.req.json())
    if (!parseResult.success) {
      return c.json(parseResult.error, 400)
    }
    const { password, newPassword } = parseResult.data
    const isSuccess = await auth.changePassword(password, newPassword, c)
    if (!isSuccess) {
      return c.json({ error: "Invalid password" }, 400)
    }
    return c.json({ success: true })
  })

const SESSION_EXPIRE_INTERVAL = 60 * 60 * 1000
setInterval(async () => {
  await auth.expireSessions()
}, SESSION_EXPIRE_INTERVAL)
