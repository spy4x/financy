import { Context } from "hono"
import { CookieManager } from "./cookie.ts"
import { AuthData } from "./types.ts"
import { SessionManager } from "./session.ts"
import { PasswordMethod } from "./password.ts"
import { db } from "../db.ts"
import { TOTPMethod } from "./totp.ts"
import { TelegramMethod } from "./telegram.ts"
import { APIContext } from "../../_types.ts"
import { UserMFAStatus } from "@shared/types"
import { eventBus } from "@api/services/eventBus.ts"
import { UserSignedUpEvent } from "@api/cqrs/events.ts"

class Auth {
  private cookie = new CookieManager()
  private session = new SessionManager()
  private totp = new TOTPMethod(this.session)
  private usernamePassword = new PasswordMethod(this.session)
  private telegram = new TelegramMethod(this.session)

  async getForRequest(context: Context<APIContext>): Promise<null | AuthData> {
    const sessionIdToken = await this.cookie.getSessionIdToken(context)
    if (!sessionIdToken) {
      return null
    }

    const result = await this.session.validate(sessionIdToken)
    if (!result) {
      this.cookie.invalidate(context)
      return null
    }

    const { session, user } = result
    const key = await db.userKey.findById(session.keyId)

    if (!user || !key) {
      this.cookie.invalidate(context)
      return null
    }
    return { user, key, session }
  }

  async signInWithPassword(
    username: string,
    password: string,
    context: Context<APIContext>,
  ): Promise<null | AuthData> {
    const authData = await this.usernamePassword.check(username, password)
    if (!authData) return null
    if (authData.user.deletedAt) {
      return null
    }
    await this.cookie.set(
      context,
      authData.user.id,
      this.session.getIdTokenForCookie(authData.session),
    )
    authData.user = await db.user.updateOne({
      id: authData.user.id,
      data: { lastLoginAt: new Date() },
    })
    return authData
  }

  async signUpWithPassword(
    username: string,
    password: string,
    context: Context<APIContext>,
  ): Promise<null | AuthData> {
    const authData = await this.usernamePassword.signUp(username, password)
    if (!authData) return null
    if (authData.user.deletedAt) {
      return null
    }
    await this.cookie.set(
      context,
      authData.user.id,
      this.session.getIdTokenForCookie(authData.session),
    )

    eventBus.emit(new UserSignedUpEvent({ user: authData.user, username }))
    console.log("User signed up. Sending response back", { userId: authData.user.id, username })

    return authData
  }

  async signInWithTelegram(
    telegramId: number,
    context: Context<APIContext>,
  ): Promise<null | AuthData> {
    const authData = await this.telegram.check(telegramId)
    if (!authData) return null
    if (authData.user.deletedAt) {
      return null
    }
    await this.cookie.set(
      context,
      authData.user.id,
      this.session.getIdTokenForCookie(authData.session),
    )
    authData.user = await db.user.updateOne({
      id: authData.user.id,
      data: { lastLoginAt: new Date() },
    })
    return authData
  }

  async signUpWithTelegram(
    telegramId: number,
    firstName: string,
    lastName: string | undefined,
    context?: Context<APIContext>,
  ): Promise<null | AuthData> {
    const authData = await this.telegram.signUp(telegramId, firstName, lastName)
    if (!authData) return null
    if (authData.user.deletedAt) {
      return null
    }

    // Only set cookie if context is provided (web requests)
    if (context) {
      await this.cookie.set(
        context,
        authData.user.id,
        this.session.getIdTokenForCookie(authData.session),
      )
    }

    eventBus.emit(
      new UserSignedUpEvent({
        user: authData.user,
        username: `telegram:${telegramId}`,
      }),
    )
    console.log("User signed up via Telegram. Sending response back", {
      userId: authData.user.id,
      telegramId,
    })

    return authData
  }

  async connectTelegram(
    authData: AuthData,
    telegramId: number,
  ): Promise<null | AuthData> {
    return await this.telegram.connect(authData.user.id, telegramId)
  }

  async findUserByTelegramId(telegramId: number): Promise<null | AuthData["user"]> {
    return await this.telegram.findUserByTelegramId(telegramId)
  }

  async isTelegramIdRegistered(telegramId: number): Promise<boolean> {
    return await this.telegram.isTelegramIdRegistered(telegramId)
  }

  async checkTelegramAuth(telegramId: number): Promise<null | AuthData> {
    return await this.telegram.check(telegramId)
  }

  async generateTelegramConnectionCode(userId: number): Promise<
    {
      error: string
      code: null
    } | {
      error: null
      code: string
    }
  > {
    return await this.telegram.generateConnectionCode(userId)
  }

  async completeTelegramConnection(telegramId: number, connectionCode: string): Promise<
    {
      error: string
      user: null
    } | {
      error: null
      user: { id: number; firstName: string | null }
    }
  > {
    return await this.telegram.completeConnection(telegramId, connectionCode)
  }

  async disconnectTelegram(userId: number): Promise<boolean> {
    return await this.telegram.disconnect(userId)
  }

  async connectTOTPStart(
    authData: AuthData,
  ): Promise<
    {
      error: string
      qrcode: null
      secret: null
    } | {
      error: null
      qrcode: string
      secret: string
    }
  > {
    if (authData.user.mfa === UserMFAStatus.CONFIGURED) {
      return { error: "OTP already activated for your account", qrcode: null, secret: null }
    }
    return this.totp.connectStart(authData)
  }

  async disconnectTOTP(authData: AuthData): Promise<boolean> {
    if (authData.user.mfa === UserMFAStatus.NOT_CONFIGURED) {
      return false
    }
    return this.totp.disconnect(authData)
  }

  async connectTOTPFinish(authData: AuthData, otp: string): Promise<boolean> {
    return this.totp.connectFinish(
      authData,
      otp,
    )
  }

  async checkTOTP(authData: AuthData, otp: string): Promise<boolean> {
    return this.totp.check(
      authData,
      otp,
    )
  }

  async signOut(context: Context<APIContext>): Promise<void> {
    const sessionIdToken = await this.cookie.getSessionIdToken(context)
    this.cookie.invalidate(context)
    if (sessionIdToken) {
      await auth.session.delete(sessionIdToken)
    }
  }

  async expireSessions() {
    await auth.session.deleteExpired()
  }

  async invalidateUser(userId: number): Promise<void> {
    await this.session.signOutByUser(userId)
    await db.userPushToken.deleteByUser({ userId })
  }

  async changePassword(
    oldPassword: string,
    newPassword: string,
    context: Context<APIContext>,
  ): Promise<boolean> {
    const authData = context.get("auth")
    const newSession = await this.usernamePassword.change(
      authData,
      oldPassword,
      newPassword,
    )
    if (!newSession) {
      return false
    }
    await this.cookie.set(
      context,
      authData.user.id,
      this.session.getIdTokenForCookie(newSession),
    )
    return true
  }

  setPassword(
    userId: number,
    password: string,
    username: string,
  ): Promise<boolean> {
    return this.usernamePassword.set(userId, password, username)
  }
}

export const auth = new Auth()
