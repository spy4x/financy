import * as OTPAuth from "@hectorm/otpauth"
import { encodeBase32 } from "@std/encoding"
import { qrcode } from "qrcode"
import {
  SessionMFAStatus,
  UserKey,
  UserKeyKind,
  UserMFAStatus,
  UserSessionStatus,
} from "@shared/types"
import { hash } from "@shared/helpers/hash"
import { config } from "../config.ts"
import { db } from "../db.ts"
import { SessionManager } from "./session.ts"
import { AuthData } from "./types.ts"
import { publicAPICache } from "../cache.ts"

export class TOTPMethod {
  // TODO: ? Need an AuthManager that takes care about updating DB & Cache for User/Key/Session
  constructor(private session: SessionManager) {}

  private build(secret: string) {
    return new OTPAuth.TOTP({
      // Provider or service the account is associated with.
      issuer: "yumeiot.com",
      // Account identifier.
      label: "Gardens by the Bay",
      // Algorithm used for the HMAC function, possible values are:
      //   "SHA1", "SHA224", "SHA256", "SHA384", "SHA512",
      //   "SHA3-224", "SHA3-256", "SHA3-384" and "SHA3-512".
      algorithm: "SHA1",
      // Length of the generated tokens.
      digits: 6,
      // Interval of time for which a token is valid, in seconds.
      period: 30,
      // Arbitrary key encoded in base32 or `OTPAuth.Secret` instance
      // (if omitted, a cryptographically secure random secret is generated).
      secret: OTPAuth.Secret.fromBase32(secret),
      //   or: `OTPAuth.Secret.fromBase32("US3WHSG7X5KAPV27VANWKQHF3SH3HULL")`
      //   or: `new OTPAuth.Secret()`
    })
  }

  async connectStart(authData: AuthData): Promise<
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
    if (!authData.user) {
      return { error: "User not found", qrcode: null, secret: null }
    }
    const userId = authData.user.id
    let secret = ""
    const existingKey: UserKey | null = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_2FA_CONNECTING,
      userId,
    })
    if (existingKey) {
      secret = existingKey.secret || ""
    } else {
      const userPasswordKey: UserKey | null = await db.userKey.findOne({
        kind: UserKeyKind.USERNAME_PASSWORD,
        userId,
      })
      if (!userPasswordKey) {
        return { error: "User not found", qrcode: null, secret: null }
      }
      const { identification } = userPasswordKey
      const hashedSecret = await hash(config.authTotp + identification, config.authPepper)
      const encodedSecret = encodeBase32(hashedSecret)
      await db.begin((tx) =>
        Promise.all([
          tx.userKey.createOne({
            userId,
            kind: UserKeyKind.USERNAME_2FA_CONNECTING,
            identification,
            secret: encodedSecret,
          }),
          tx.user.updateOne({
            id: userId,
            data: {
              mfa: UserMFAStatus.CONFIGURATION_NOT_FINISHED,
            },
          }),
        ])
      )
      secret = encodedSecret
    }
    if (!secret) {
      return { error: "User not found", qrcode: null, secret: null }
    }
    const totp = this.build(secret)
    const svgString = qrcode(totp.toString(), { output: "svg" })
    return { error: null, qrcode: svgString, secret }
  }

  async connectFinish(authData: AuthData, token: string): Promise<boolean> {
    const k = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_2FA_CONNECTING,
      userId: authData.user.id,
    })
    if (!k || !k.secret) {
      return false
    }

    const isValid = this.validateToken(k.secret, token)
    if (!isValid) {
      return false
    }

    try {
      const otherSessions = (await this.session.getAll(authData.user.id)).filter((session) =>
        session.id !== authData.session.id
      )
      const otherSessionIds = otherSessions.map(({ id }) => id)

      const [, , , updatedSessions] = await db.begin((tx) =>
        Promise.all([
          tx.userKey.updateOne({
            id: k.id,
            data: {
              kind: UserKeyKind.USERNAME_2FA_COMPLETED,
            },
          }),
          tx.user.updateOne({
            id: authData.user.id,
            data: {
              mfa: UserMFAStatus.CONFIGURED,
            },
          }),
          tx.userSession.updateOne({
            id: authData.session.id,
            data: {
              mfa: SessionMFAStatus.COMPLETED,
            },
          }),
          otherSessionIds.length
            ? tx.userSession.updateMany({
              ids: otherSessionIds,
              data: {
                status: UserSessionStatus.SIGNED_OUT,
              },
            })
            : Promise.resolve([]),
        ])
      )
      if (updatedSessions.length) {
        for (const updatedSession of updatedSessions) {
          await publicAPICache.userSession.set(updatedSession.id, updatedSession)
        }
      }
      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  async disconnect(authData: AuthData): Promise<boolean> {
    const k = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_2FA_COMPLETED,
      userId: authData.user.id,
    })
    if (!k || !k.secret) {
      return false
    }

    try {
      await db.begin((tx) =>
        Promise.all([
          tx.userKey.deleteOne({ id: k.id }),
          tx.user.updateOne({
            id: authData.user.id,
            data: {
              mfa: UserMFAStatus.NOT_CONFIGURED,
            },
          }),
          tx.userSession.updateOne({
            id: authData.session.id,
            data: {
              mfa: SessionMFAStatus.NOT_REQUIRED,
            },
          }),
        ])
      )
      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  async check(authData: AuthData, token: string): Promise<boolean> {
    const k = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_2FA_COMPLETED,
      userId: authData.user.id,
    })
    if (!k || !k.secret) {
      return false
    }
    const isValid = this.validateToken(k.secret, token)
    if (!isValid) {
      return false
    }
    const [user, passwordKey] = await Promise.all([
      db.user.findOne({ id: k.userId }),
      db.userKey.findOne({
        kind: UserKeyKind.USERNAME_PASSWORD,
        userId: authData.user.id,
      }),
    ])
    if (!user || !passwordKey) {
      return false
    }

    await this.session.update(authData.session.id, { mfa: SessionMFAStatus.COMPLETED })

    return true
  }

  private validateToken(secret: string, token: string): boolean {
    const totp = this.build(secret)
    const delta = totp.validate({ token, window: 1 })
    return typeof delta === "number" && (delta >= -1 && delta <= 1) // -1, 0, 1 represent the current, previous, and next token. Bigger delta is not allowed as it may be a replay attack
  }
}
