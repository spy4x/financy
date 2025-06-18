import {
  Account,
  AccountBase,
  Category,
  CategoryBase,
  Group,
  GroupBase,
  GroupMembership,
  GroupMembershipBase,
  SYNC_MODELS,
  SyncModel,
  SyncModelName,
  Tag,
  TagBase,
  Transaction,
  TransactionBase,
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
        SELECT u.*
        FROM users u
        LEFT JOIN user_keys uk
          ON u.id = uk.user_id AND uk.kind = 0
        ORDER BY u.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<(User)[]> => {
      return sql<(User)[]>`
        SELECT u.*
        FROM users u
        LEFT JOIN user_keys uk
          ON u.id = uk.user_id AND uk.kind = 0
        WHERE u.updated_at > ${updatedAtGt} AND u.id = ${userId}
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

  group = {
    ...this.buildMethods<Group, GroupBase, Partial<GroupBase>>(
      `groups`,
      publicAPICache.group,
    ),
    findMany: async (userId: number): Promise<Group[]> => {
      return sql<Group[]>`
        SELECT g.*
        FROM groups g
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        ORDER BY g.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<Group[]> => {
      return sql<Group[]>`
        SELECT g.*
        FROM groups g
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND g.updated_at > ${updatedAtGt}
        ORDER BY g.created_at DESC
      `
    },
  }

  groupMembership = {
    ...this.buildMethods<GroupMembership, GroupMembershipBase, Partial<GroupMembershipBase>>(
      `group_memberships`,
      publicAPICache.groupMembership,
    ),
    findMany: async (userId: number): Promise<GroupMembership[]> => {
      return sql<GroupMembership[]>`
        SELECT gm.*
        FROM group_memberships gm
        WHERE gm.user_id = ${userId}
        ORDER BY gm.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<GroupMembership[]> => {
      return sql<GroupMembership[]>`
        SELECT gm.*
        FROM group_memberships gm
        WHERE gm.user_id = ${userId}
        AND gm.updated_at > ${updatedAtGt}
        ORDER BY gm.created_at DESC
      `
    },
    findByUserAndGroup: async (
      userId: number,
      groupId: number,
    ): Promise<GroupMembership | null> => {
      const results = await sql<GroupMembership[]>`
        SELECT gm.*
        FROM group_memberships gm
        WHERE gm.user_id = ${userId}
        AND gm.group_id = ${groupId}
        AND gm.deleted_at IS NULL
        LIMIT 1
      `
      return results[0] || null
    },
  }

  account = {
    ...this.buildMethods<Account, AccountBase, Partial<AccountBase>>(
      `accounts`,
      publicAPICache.account,
    ),
    findMany: async (userId: number): Promise<Account[]> => {
      return sql<Account[]>`
        SELECT a.*
        FROM accounts a
        JOIN groups g ON a.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        ORDER BY a.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<Account[]> => {
      return sql<Account[]>`
        SELECT a.*
        FROM accounts a
        JOIN groups g ON a.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND a.updated_at > ${updatedAtGt}
        ORDER BY a.created_at DESC
      `
    },
    verifyLegitimacy: async (
      account: AccountBase,
      userId: number,
    ): Promise<boolean> => {
      // check groupId
      const groupMemberships = await this.groupMembership.findMany(userId)
      const groupIds = groupMemberships.map((gm) => gm.groupId)
      if (!groupIds.includes(account.groupId)) {
        console.warn(
          `Account groupId "${account.groupId}" does not belong to userId "${userId}"`,
        )
        return false
      }
      return true
    },
  }

  category = {
    ...this.buildMethods<Category, CategoryBase, Partial<CategoryBase>>(
      `categories`,
      publicAPICache.category,
    ),
    findMany: async (userId: number): Promise<Category[]> => {
      return sql<Category[]>`
        SELECT c.*
        FROM categories c
        JOIN groups g ON c.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        ORDER BY c.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<Category[]> => {
      return sql<Category[]>`
        SELECT c.*
        FROM categories c
        JOIN groups g ON c.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND c.updated_at > ${updatedAtGt}
        ORDER BY c.created_at DESC
      `
    },
    verifyLegitimacyById: async (
      categoryId: number,
      userId: number,
    ): Promise<boolean> => {
      const category = await this.category.findOne({ id: categoryId })
      if (!category) {
        console.warn(`Category with id "${categoryId}" not found`)
        return false
      }
      return this.category.verifyLegitimacy(category, userId)
    },
    verifyLegitimacy: async (
      category: CategoryBase,
      userId: number,
    ): Promise<boolean> => {
      // check groupId
      const groupMemberships = await this.groupMembership.findMany(userId)
      const groupIds = groupMemberships.map((gm) => gm.groupId)
      if (!groupIds.includes(category.groupId)) {
        console.warn(
          `Category groupId "${category.groupId}" does not belong to userId "${userId}"`,
        )
        return false
      }
      return true
    },
  }

  tag = {
    ...this.buildMethods<Tag, TagBase, Partial<TagBase>>(`tags`, publicAPICache.tag),
    findMany: async (_userId: number): Promise<Tag[]> => {
      // -- JOIN groups g ON t.group_id = g.id -- TODO: create tags.group_id
      // -- WHERE t.user_id = ${userId} -- TODO: create tags.group_id
      return sql<Tag[]>`
        SELECT t.*
        FROM tags t
        ORDER BY t.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, _userId: number): Promise<Tag[]> => {
      // -- JOIN groups g ON t.group_id = g.id -- TODO: create tags.group_id
      // -- AND t.user_id = ${userId} -- TODO: create tags.group_id
      return sql<Tag[]>`
        SELECT t.*
        FROM tags t
        WHERE 1=1 
        AND t.updated_at > ${updatedAtGt}
        ORDER BY t.created_at DESC
      `
    },
  }

  transaction = {
    ...this.buildMethods<Transaction, TransactionBase, Partial<SyncModel>>(
      `transactions`,
      publicAPICache.transaction,
    ),
    findMany: async (userId: number): Promise<SyncModel[]> => {
      return sql<SyncModel[]>`
        SELECT t.*
        FROM transactions t
        WHERE t.group_id IN (
          SELECT group_id FROM group_memberships WHERE user_id = ${userId}
        )
        ORDER BY t.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<SyncModel[]> => {
      return sql<SyncModel[]>`
        SELECT t.*
        FROM transactions t
        WHERE t.group_id IN (
          SELECT group_id FROM group_memberships WHERE user_id = ${userId}
        )
        AND t.updated_at > ${updatedAtGt}
        ORDER BY t.created_at DESC
      `
    },
    verifyLegitimacyById: async (
      transactionId: number,
      userId: number,
    ): Promise<boolean> => {
      // check if transaction exists and belongs to user's groups
      const transaction = await this.transaction.findOne({ id: transactionId })
      if (!transaction) {
        console.warn(`Transaction with id "${transactionId}" not found`)
        return false
      }
      return this.transaction.verifyLegitimacy(transaction, userId)
    },
    verifyLegitimacy: async (
      transaction: TransactionBase,
      userId: number,
    ): Promise<boolean> => {
      // check groupId
      const groupMemberships = await this.groupMembership.findMany(userId)
      const groupIds = groupMemberships.map((gm) => gm.groupId)
      if (!groupIds.includes(transaction.groupId)) {
        console.warn(
          `Transaction groupId "${transaction.groupId}" does not belong to userId "${userId}"`,
        )
        return false
      }
      // check accountId
      const accounts = await this.account.findMany(userId)
      const accountIds = accounts.map((a) => a.id)
      if (!accountIds.includes(transaction.accountId)) {
        console.warn(
          `Transaction accountId "${transaction.accountId}" does not belong to userId "${userId}"`,
        )
        return false
      }
      // check categoryId
      if (transaction.categoryId) {
        const categories = await this.category.findMany(userId)
        const categoryIds = categories.map((c) => c.id)
        if (!categoryIds.includes(transaction.categoryId)) {
          console.warn(
            `Transaction categoryId "${transaction.categoryId}" does not belong to userId "${userId}"`,
          )
          return false
        }
      }
      return true
    },
  }

  syncData = async (
    callback: (model: SyncModelName, data: SyncModel[]) => void,
    userId: number,
    lastSyncAt: number,
  ) => {
    const lastSyncAtDate = new Date(lastSyncAt)
    for (let i = 0; i < SYNC_MODELS.length; i += 1) {
      const model = SYNC_MODELS[i]
      let data = []
      console.log(`🔄 Syncing model: ${model} for userId: ${userId}`)
      if ("findChanged" in db[model] && typeof db[model].findChanged === "function") {
        data = await db[model].findChanged(lastSyncAtDate, userId)
      } else {
        data = await db[model].findMany(userId)
      }
      callback(model, data)
    }
  }
}

export const db = new DbService()
await db.connect()
console.log(`✅ Connected to DB`)
