import {
  SYNC_MODELS,
  SyncModel,
  SyncModelName,
  User,
  UserBase,
  UserKey,
  UserKeyKind,
  UserPushToken,
  UserPushTokenBase,
  UserSession,
  UserSessionBase,
} from "@shared/types"
import { DbServiceBase, sql } from "@server/db"
import { publicAPICache } from "./cache.ts"
// import { getLatestMetrics } from "../routes/metric.ts"

export class DbService extends DbServiceBase {
  user = {
    ...this.buildMethods<User, UserBase, Partial<UserBase>>(`users`, publicAPICache.user),
    findMany: async (): Promise<User[]> => {
      return sql<User[]>`
        SELECT u.*, uk.identification as username 
        FROM users u
        LEFT JOIN user_keys uk
          ON u.id = uk.user_id AND uk.kind = 0
        ORDER BY u.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date): Promise<(User)[]> => {
      return sql<(User)[]>`
        SELECT u.*, uk.identification as username
        FROM users u
        LEFT JOIN user_keys uk
          ON u.id = uk.user_id AND uk.kind = 0
        WHERE u.updated_at > ${updatedAtGt}
        ORDER BY u.created_at DESC
      `
    },
  }

  userSession = {
    createOne: async (params: {
      data: UserSessionBase
    }): Promise<UserSession> => {
      const created = (
        await sql<UserSession[]>`
            INSERT INTO user_sessions
            ${sql(this.sanitize(params.data))}
            RETURNING *`
      )[0]
      if (created) {
        await publicAPICache.userSession.set(created.id, created)
      }
      return created
    },
    findOne: async ({ id }: { id: number }): Promise<null | UserSession> => {
      return publicAPICache.userSession.wrap(
        id,
        async () => (await sql<UserSession[]>`SELECT * FROM user_sessions WHERE id = ${id}`)[0],
      )
    },
    findMany: async (params: {
      userId?: number
    }): Promise<UserSession[]> => {
      return await sql<
        UserSession[]
      >`SELECT * FROM user_sessions 
      WHERE TRUE
      ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
      ORDER BY created_at DESC`
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserSessionBase>
    }): Promise<UserSession> => {
      const updated = (
        await sql<UserSession[]>`
            UPDATE user_sessions
            SET updated_at = NOW(), ${sql(this.sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
      if (updated) {
        await publicAPICache.userSession.set(updated.id, updated)
      }
      return updated
    },
    updateMany: async (params: {
      userId?: number
      expiresAt?: { lte?: Date }
      ids?: number[]
      data: Partial<UserSessionBase>
    }): Promise<UserSession[]> => {
      return (
        await sql<UserSession[]>`
            UPDATE user_sessions
            SET updated_at = NOW(), ${sql(this.sanitize(params.data))}
            WHERE TRUE
            ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
            ${params.expiresAt?.lte ? sql`AND expires_at <= ${params.expiresAt.lte}` : sql``}
            ${params.ids ? sql`AND id = ANY(${sql.array(params.ids)}::int[])` : sql``}
            RETURNING *`
      )
    },
  }

  userKey = {
    findOne: async (params: {
      id?: number
      userId?: number
      kind?: UserKeyKind
      identification?: string
    }): Promise<null | UserKey> => {
      const found = (
        await sql<UserKey[]>`
            SELECT *
            FROM user_keys
            WHERE TRUE
            ${params.id ? sql`AND id = ${params.id}` : sql``}
            ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
            ${params.kind !== undefined ? sql`AND kind = ${params.kind}` : sql``}
            ${params.identification ? sql`AND identification = ${params.identification}` : sql``}
            LIMIT 1`
      )[0]
      if (found) {
        await publicAPICache.userKey.set(found.id, found)
      }
      return found
    },
    findById: async (id: number): Promise<UserKey | null> => {
      return publicAPICache.userKey.wrap(
        id,
        async () => (await sql<UserKey[]>`SELECT * FROM user_keys WHERE id = ${id}`)[0],
      )
    },
    findMany: async (params: {
      userId?: number
      kind?: UserKeyKind
    }): Promise<UserKey[]> => {
      return await sql<UserKey[]>`
        SELECT *
        FROM user_keys
        WHERE TRUE
        ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
        ${params.kind !== undefined ? sql`AND kind = ${params.kind}` : sql``}
        ORDER BY created_at DESC`
    },
    createOne: async (params: {
      userId: number
      kind: number
      identification: string
      secret: string
    }): Promise<UserKey> => {
      const created = (
        await sql<UserKey[]>`
            INSERT INTO user_keys (user_id, kind, identification, secret)
            VALUES (${params.userId}, ${params.kind}, ${params.identification}, ${params.secret})
            RETURNING *`
      )[0]
      if (created) {
        await publicAPICache.userKey.set(created.id, created)
      }
      return created
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserKey>
    }): Promise<UserKey> => {
      const updated = (
        await sql<UserKey[]>`
            UPDATE user_keys
            SET updated_at = NOW(), ${sql(this.sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
      if (updated) {
        await publicAPICache.userKey.set(updated.id, updated)
      }
      return updated
    },
    deleteOne: async (params: { id: number }): Promise<void> => {
      const deleted = await sql<UserKey[]>`
            DELETE FROM user_keys
            WHERE id = ${params.id}
            RETURNING *`
      if (deleted) {
        await publicAPICache.userKey.delete(params.id)
      }
    },
  }

  userPushToken = {
    findAll: async (): Promise<UserPushToken[]> => {
      return await sql<UserPushToken[]>`
        SELECT *
        FROM user_push_tokens
        WHERE deleted_at IS NULL 
        ORDER BY created_at DESC`
    },
    findMany: async (params: {
      userId: number
    }): Promise<UserPushToken[]> => {
      return await sql<UserPushToken[]>`
        SELECT *
        FROM user_push_tokens
        WHERE deleted_at IS NULL AND user_id = ${params.userId} 
        ORDER BY created_at DESC`
    },
    findOne: async (
      { deviceId, userId }: { deviceId: string; userId: number },
    ): Promise<null | UserPushToken> => {
      return (
        await sql<
          UserPushToken[]
        >`SELECT * FROM user_push_tokens WHERE deleted_at is NULL AND device_id = ${deviceId} AND user_id = ${userId}`
      )[0]
    },
    createOne: async (params: UserPushTokenBase) => {
      return (
        await sql<UserPushToken[]>`
            INSERT INTO user_push_tokens
            ${sql(this.sanitize(params))}
            RETURNING *`
      )[0]
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserPushToken>
    }): Promise<UserPushToken> => {
      return (
        await sql<UserPushToken[]>`
            UPDATE user_push_tokens
            SET updated_at = NOW(), ${sql(this.sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
    },
    deleteOne: async (params: { deviceId: string; userId?: number }): Promise<void> => {
      await sql<UserPushToken[]>`
        UPDATE user_push_tokens
          SET updated_at = NOW(), deleted_at = NOW()
          WHERE device_id = ${params.deviceId} ${
        params.userId ? sql`AND user_id = ${params.userId}` : sql``
      }
          RETURNING *`
    },
    deleteByUser: async (params: { userId: number }): Promise<void> => {
      await sql<UserPushToken[]>`
            UPDATE user_push_tokens
            SET updated_at = NOW(), deleted_at = NOW()
            WHERE user_id = ${params.userId}
            RETURNING *`
    },
  }

  syncData = async (
    callback: (model: SyncModelName, data: SyncModel[]) => void,
    lastSyncAt: number,
  ) => {
    const lastSyncAtDate = new Date(lastSyncAt)
    for (let i = 0; i < SYNC_MODELS.length; i += 1) {
      const model = SYNC_MODELS[i]
      let data = []
      if ("findChanged" in db[model] && typeof db[model].findChanged === "function") {
        data = await db[model].findChanged(lastSyncAtDate)
      } else {
        data = await db[model].findMany()
      }
      callback(model, data)
    }
  }
}

export const db = new DbService()
