import { User, UserSession, UserSessionBase, UserSessionStatus } from "@shared/types"
import { getRandomString } from "@shared/helpers/random"
import { checkHash, hash } from "@shared/helpers/hash"

import { db } from "../db.ts"
import { config } from "../config.ts"
import { publicAPICache } from "../cache.ts"

export class SessionManager {
  async createBody(
    session: Pick<UserSessionBase, "userId" | "keyId" | "mfa">,
  ): Promise<{ notHashedToken: string; session: UserSessionBase }> {
    const notHashedToken = getRandomString(config.authSessionLength)
    const token = await hash(notHashedToken, config.authPepper)
    return {
      notHashedToken,
      session: {
        ...session,
        token,
        status: UserSessionStatus.ACTIVE,
        expiresAt: this.getSessionExpirationDate(),
      },
    }
  }

  async create(
    session_: Pick<UserSessionBase, "userId" | "keyId" | "mfa">,
    tx?: typeof db,
  ): Promise<null | UserSession> {
    const result = await this.createBody(session_)
    const session = await (tx || db).userSession.createOne({ data: result.session })
    if (!session) {
      return null
    }
    return { ...session, token: result.notHashedToken }
  }

  async validate(sessionIdToken: string): Promise<null | { session: UserSession; user: User }> {
    if (await publicAPICache.isSessionTokenExpired.get(sessionIdToken)) {
      return null
    }

    const idToken = this.parseSessionIdToken(sessionIdToken)
    if (!idToken) {
      return null
    }

    let session = await db.userSession.findOne({ id: idToken.id })

    if (
      !session ||
      session.status !== UserSessionStatus.ACTIVE ||
      !(await checkHash(idToken.token, session.token, config.authPepper)) ||
      (session.expiresAt && session.expiresAt < new Date())
    ) {
      void publicAPICache.isSessionTokenExpired.set(sessionIdToken, true)
      return null
    }

    const user = await db.user.findOne({ id: session.userId })
    if (!user) {
      return null
    }
    // if expires in less than 1/4 of the duration, update it to extend
    if (
      session.expiresAt &&
      session.expiresAt <
        new Date(Date.now() + (config.authSessionDurationMin * 60 * 1000) / 4)
    ) {
      const updatedSession = await db.userSession.updateOne({
        id: session.id,
        data: {
          expiresAt: this.getSessionExpirationDate(),
        },
      })
      if (updatedSession) {
        session = updatedSession
      }
    }
    return { session, user }
  }

  async delete(sessionIdToken: string): Promise<boolean> {
    const idToken = this.parseSessionIdToken(sessionIdToken)
    if (!idToken) {
      return false
    }
    const session = await db.userSession.findOne({ id: idToken.id })
    if (!session || session.status !== UserSessionStatus.ACTIVE) {
      return false
    }

    if (!(await checkHash(idToken.token, session.token, config.authPepper))) {
      return false
    }
    await db.userSession.updateOne({
      id: idToken.id,
      data: {
        status: UserSessionStatus.SIGNED_OUT,
      },
    })
    return true
  }

  async signOutByUser(userId: number): Promise<void> {
    const sessions = await this.getAll(userId)
    for (let i = 0; i < sessions.length; i += 1) {
      const session = sessions[i]
      session.status = UserSessionStatus.SIGNED_OUT
      await publicAPICache.userSession.set(session.id, session)
    }

    await db.userSession.updateMany({
      userId,
      data: {
        status: UserSessionStatus.SIGNED_OUT,
      },
    })
  }

  async deleteExpired(): Promise<void> {
    const expiredAtLte = new Date()
    const updatedSessions = await db.userSession.updateMany({
      expiresAt: { lte: expiredAtLte },
      data: {
        status: UserSessionStatus.EXPIRED,
      },
    })
    for (const session of updatedSessions) {
      await publicAPICache.userSession.set(session.id, session)
    }
  }

  get(id: number): Promise<null | UserSession> {
    return db.userSession.findOne({ id })
  }

  async getAll(userId: number): Promise<UserSession[]> {
    return db.userSession.findMany({ userId })
  }

  async update(
    id: number,
    session: Partial<UserSessionBase>,
  ): Promise<null | UserSession> {
    const result = await db.userSession.updateOne({ id, data: session })
    return result
  }

  getIdTokenForCookie(session: UserSession): string {
    return `${session.id}:${session.token}`
  }

  parseSessionIdToken(sessionIdToken: string): null | { id: number; token: string } {
    const [idStr, token] = sessionIdToken.split(":")
    if (!idStr || !token) {
      return null
    }
    const id = Number(idStr)
    if (!id) {
      return null
    }
    return { id, token }
  }

  private getSessionExpirationDate(): Date {
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + config.authSessionDurationMin)
    return expiresAt
  }
}
