import { checkHash, hash } from "@shared/helpers/hash.ts"
import {
  SessionMFAStatus,
  User,
  UserKey,
  UserKeyKind,
  UserMFAStatus,
  UserRole,
  UserSession,
} from "@shared/types"
import { config } from "../config.ts"
import { db } from "../db.ts"
import { SessionManager } from "./session.ts"
import { AuthData } from "./types.ts"

export class PasswordMethod {
  constructor(private session: SessionManager) {}

  async check(username: string, password: string): Promise<null | AuthData> {
    const key = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_PASSWORD,
      identification: username,
    })
    if (!key || !key.secret) {
      return null
    }
    if (!(await checkHash(password, key.secret, config.authPepper))) {
      return null
    }
    const user = await db.user.findOne({ id: key.userId })
    if (!user) {
      return null
    }

    const session = await this.session.create(
      {
        userId: key.userId,
        keyId: key.id,
        mfa: user.mfa === UserMFAStatus.CONFIGURED
          ? SessionMFAStatus.NOT_PASSED_YET
          : SessionMFAStatus.NOT_REQUIRED,
      },
    )
    if (!session) {
      return null
    }

    return {
      user,
      key,
      session,
    }
  }

  async signUp(username: string, password: string): Promise<null | AuthData> {
    return db.begin(async (tx) => {
      const existingKey = await tx.userKey.findOne({
        kind: UserKeyKind.USERNAME_PASSWORD,
        identification: username,
      })
      if (existingKey) { // Username already taken
        return null
      }
      const user = await tx.user.createOne({
        data: {
          firstName: "",
          lastName: "",
          mfa: UserMFAStatus.NOT_CONFIGURED,
          role: UserRole.VIEWER,
          lastLoginAt: new Date(),
        },
      })
      if (!user) {
        console.error("Failed to create user", { username })
        return null
      }
      const key = await tx.userKey.createOne({
        userId: user.id,
        kind: UserKeyKind.USERNAME_PASSWORD,
        identification: username,
        secret: await hash(password, config.authPepper),
      })
      if (!key) {
        console.error("Failed to create key", {
          userId: user.id,
          username,
          kind: UserKeyKind.USERNAME_PASSWORD,
        })
        return null
      }
      const session = await this.session.create({
        userId: user.id,
        keyId: key.id,
        mfa: SessionMFAStatus.NOT_REQUIRED,
      }, tx)
      if (!session) {
        console.error("Failed to create session", { userId: user.id, keyId: key.id, username })
        return null
      }
      return { user, key, session }
    })
  }

  async connect(userId: number, username: string, password: string): Promise<null | AuthData> {
    const key = await db.userKey.createOne({
      userId,
      kind: UserKeyKind.USERNAME_PASSWORD,
      identification: username,
      secret: await hash(password, config.authPepper),
    })
    if (!key) {
      console.error("Failed to create key", {
        userId,
        username,
        kind: UserKeyKind.USERNAME_PASSWORD,
      })
      return null
    }
    const user = await db.user.findOne({ id: userId })
    if (!user) {
      // throw new Error("Failed to get user")
      console.error("Failed to get user", { userId })
      return null
    }

    const session = await this.session.create({
      userId,
      keyId: key.id,
      mfa: user.mfa === UserMFAStatus.CONFIGURED
        ? SessionMFAStatus.NOT_PASSED_YET
        : SessionMFAStatus.NOT_REQUIRED,
    })
    if (!session) {
      console.error("Failed to create session", { userId, keyId: key.id, username })
      return null
    }
    return {
      user,
      key,
      session,
    }
  }

  async getUserByUsername(username: string): Promise<null | User> {
    const key = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_PASSWORD,
      identification: username,
    })
    if (!key) {
      return null
    }
    return db.user.findOne({ id: key.userId })
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    const key = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_PASSWORD,
      identification: username,
    })
    if (!key) {
      return false
    }
    return true
  }

  async change(
    authData: AuthData,
    oldPassword: string,
    newPassword: string,
  ): Promise<null | UserSession> {
    let k: UserKey | null = null
    if (authData.key.kind === UserKeyKind.USERNAME_PASSWORD) {
      k = authData.key
    } else {
      k = await db.userKey.findOne({
        kind: UserKeyKind.USERNAME_PASSWORD,
        userId: authData.user.id,
      })
    }
    if (!k || !k.secret) {
      return null
    }
    if (!(await checkHash(oldPassword, k.secret, config.authPepper))) {
      return null
    }
    const newHash = await hash(newPassword, config.authPepper)
    await db.userKey.updateOne({ id: k.id, data: { secret: newHash } })
    await this.session.signOutByUser(authData.user.id) // security measure - what if user got hacked and wants to change password, so other sessions are invalidated
    return this.session.create({
      userId: authData.user.id,
      keyId: k.id,
      mfa: authData.user.mfa === UserMFAStatus.CONFIGURED
        ? SessionMFAStatus.COMPLETED
        : SessionMFAStatus.NOT_REQUIRED,
    })
  }

  async set(userId: number, password: string, username: string): Promise<boolean> {
    const user = await db.user.findOne({ id: userId })
    if (!user) {
      return false
    }
    const otherUserUsername = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_PASSWORD,
      identification: username,
    })
    if (otherUserUsername && otherUserUsername.userId !== user.id) {
      return false
    }
    const passwordHash = await hash(password, config.authPepper)
    const k = await db.userKey.findOne({
      kind: UserKeyKind.USERNAME_PASSWORD,
      userId,
    })
    if (k) {
      await db.userKey.updateOne({
        id: k.id,
        data: {
          secret: passwordHash,
          identification: username,
        },
      })
    } else {
      // create new key
      await db.userKey.createOne({
        userId,
        kind: UserKeyKind.USERNAME_PASSWORD,
        identification: username,
        secret: passwordHash,
      })
    }
    await this.session.signOutByUser(userId) // security measure - what if user got hacked and wants to change password, so other sessions are invalidated
    return true
  }
}
