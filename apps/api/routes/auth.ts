import { Hono } from "hono"
import {
  authOTPSchema,
  authPasswordChangeSchema,
  authUsernamePasswordSchema,
  SessionMFAStatus,
  validate,
} from "@shared/types"
import { auth } from "@api/services/auth/+index.ts"
import { APIContext } from "../_types.ts"
import { isAuthenticated1FA, isAuthenticated2FA } from "../middlewares/auth.ts"

export const authRoute = new Hono<APIContext>()
  .post(`/sign-out`, async (c) => {
    await auth.signOut(c)
    return c.json({ success: true })
  })
  // .use(strictRateLimiter)
  .get(`/me`, async (c) => {
    const authData = c.get("auth")
    if (!authData) {
      return c.json({ error: "User not signed in" }, 401)
    }
    return c.json(authData.user)
  })
  .post(`password/check`, async (c) => {
    const body = await c.req.json()
    const validationResult = validate(authUsernamePasswordSchema, body)
    if (validationResult.error) {
      return c.json({ error: validationResult.error.description }, 400)
    }
    const { username, password } = validationResult.data
    const authData = await auth.signInWithPassword(username, password, c)
    if (!authData) {
      return c.json({ error: "Invalid username or password" }, 401)
    }
    return c.json(
      authData.user,
      authData.session.mfa === SessionMFAStatus.NOT_PASSED_YET ? 202 : 200,
    )
  })
  .post(`/password/sign-up`, async (c) => {
    const body = await c.req.json()
    const validationResult = validate(authUsernamePasswordSchema, body)
    if (validationResult.error) {
      return c.json({ error: validationResult.error.description }, 400)
    }
    const { username, password } = validationResult.data
    const authData = await auth.signUpWithPassword(username, password, c)
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
    try {
      const body = await c.req.json()
      const validationResult = validate(authOTPSchema, body)
      if (validationResult.error) {
        return c.json({ error: validationResult.error.description }, 400)
      }
      const isSuccess = await auth.checkTOTP(authData, validationResult.data.otp)
      if (!isSuccess) {
        return c.json({ error: "Invalid token" }, 401)
      }
      return c.json(authData.user)
    } catch (_error) {
      return c.json({ error: "Invalid request format" }, 400)
    }
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
    const body = await c.req.json()
    const validationResult = validate(authOTPSchema, body)
    if (validationResult.error) {
      return c.json({ error: validationResult.error.description }, 400)
    }
    const isSuccess = await auth.connectTOTPFinish(
      authData,
      validationResult.data.otp,
    )
    if (!isSuccess) {
      return c.json({ error: "Code is incorrect" }, 400)
    }
    return c.json({ success: true })
  })
  .post(`/telegram/connect`, async (c) => {
    const authData = c.get("auth")
    const { error, code } = await auth.generateTelegramConnectionCode(authData.user.id)
    if (error) {
      return c.json({ error }, 400)
    }
    return c.json({ code })
  })
  .post(`/telegram/disconnect`, async (c) => {
    const authData = c.get("auth")
    const isSuccess = await auth.disconnectTelegram(authData.user.id)
    if (!isSuccess) {
      return c.json({ error: "Telegram not connected to your account" }, 400)
    }
    return c.json({ success: true })
  })
  // .use(rateLimiter)
  .use(isAuthenticated2FA)
  .post(`/totp/disconnect`, async (c) => {
    const isSuccess = await auth.disconnectTOTP(c.get("auth"))
    if (!isSuccess) {
      return c.json({ error: "OTP already disabled for your account" }, 400)
    }
    return c.json({ success: true })
  })
  .post(`/password/change`, async (c) => {
    const body = await c.req.json()
    const validationResult = validate(authPasswordChangeSchema, body)
    if (validationResult.error) {
      return c.json({ error: validationResult.error.description }, 400)
    }
    const { password, newPassword } = validationResult.data
    const isSuccess = await auth.changePassword(password, newPassword, c)
    if (!isSuccess) {
      return c.json({ error: "Invalid password" }, 400)
    }
    return c.json({ success: true })
  })

// TODO: move this to a better place
// This is a temporary solution to expire sessions every hour
// This should be done in a more efficient way, like using a cron job or similar
const SESSION_EXPIRE_INTERVAL = 60 * 60 * 1000
setInterval(async () => {
  await auth.expireSessions()
}, SESSION_EXPIRE_INTERVAL)
