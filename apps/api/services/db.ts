import {
  Account,
  AccountBase,
  Category,
  CategoryBase,
  Currency,
  CurrencyBase,
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
  TransactionCreate,
  User,
  UserBase,
  UserKey,
  UserKeyKind,
  UserPushToken,
  UserPushTokenBase,
  UserSession,
  UserSessionBase,
  UserSettings,
  UserSettingsBase,
} from "@shared/types"
import { DbServiceBase } from "@server/db"
import { publicAPICache } from "./cache.ts"
// import { getLatestMetrics } from "../routes/metric.ts"

export class DbService extends DbServiceBase {
  user = {
    // buildMethods generates: findOne (PK), findChanged (no sync index), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<User, UserBase, Partial<UserBase>>(`users`, publicAPICache.user),
    findMany: async (): Promise<User[]> => {
      return this.sql<User[]>`
        SELECT u.*
        FROM users u
        LEFT JOIN user_keys uk
          ON u.id = uk.user_id AND uk.kind = 0
        ORDER BY u.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<(User)[]> => {
      return this.sql<(User)[]>`
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
        await this.sql<UserSession[]>`
            INSERT INTO user_sessions
            ${this.sql(this.sanitize(params.data))}
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
        async () =>
          (await this.sql<UserSession[]>`SELECT * FROM user_sessions WHERE id = ${id}`)[0],
      )
    },
    findMany: async (params: {
      userId?: number
    }): Promise<UserSession[]> => {
      // INDEX: idx_user_sessions_by_user_id (for user_id filter)
      return await this.sql<
        UserSession[]
      >`SELECT * FROM user_sessions 
      WHERE TRUE
      ${params.userId ? this.sql`AND user_id = ${params.userId}` : this.sql``}
      ORDER BY created_at DESC`
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserSessionBase>
    }): Promise<UserSession> => {
      const updated = (
        await this.sql<UserSession[]>`
            UPDATE user_sessions
            SET updated_at = NOW(), ${this.sql(this.sanitize(params.data))}
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
      // INDEX: idx_user_sessions_by_user_id (for user_id), idx_user_sessions_by_expires_at (for expires_at)
      return (
        await this.sql<UserSession[]>`
            UPDATE user_sessions
            SET updated_at = NOW(), ${this.sql(this.sanitize(params.data))}
            WHERE TRUE
            ${params.userId ? this.sql`AND user_id = ${params.userId}` : this.sql``}
            ${
          params.expiresAt?.lte ? this.sql`AND expires_at <= ${params.expiresAt.lte}` : this.sql``
        }
            ${
          params.ids ? this.sql`AND id = ANY(${this.sql.array(params.ids)}::int[])` : this.sql``
        }
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
      // INDEX: idx_user_keys_by_user_id (for user_id), idx_user_keys_by_identification (for identification)
      const found = (
        await this.sql<UserKey[]>`
            SELECT *
            FROM user_keys
            WHERE TRUE
            ${params.id ? this.sql`AND id = ${params.id}` : this.sql``}
            ${params.userId ? this.sql`AND user_id = ${params.userId}` : this.sql``}
            ${params.kind !== undefined ? this.sql`AND kind = ${params.kind}` : this.sql``}
            ${
          params.identification
            ? this.sql`AND identification = ${params.identification}`
            : this.sql``
        }
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
        async () => (await this.sql<UserKey[]>`SELECT * FROM user_keys WHERE id = ${id}`)[0],
      )
    },
    findMany: async (params: {
      userId?: number
      kind?: UserKeyKind
    }): Promise<UserKey[]> => {
      // INDEX: idx_user_keys_by_user_id (for user_id filter)
      return await this.sql<UserKey[]>`
        SELECT *
        FROM user_keys
        WHERE TRUE
        ${params.userId ? this.sql`AND user_id = ${params.userId}` : this.sql``}
        ${params.kind !== undefined ? this.sql`AND kind = ${params.kind}` : this.sql``}
        ORDER BY created_at DESC`
    },
    createOne: async (params: {
      userId: number
      kind: number
      identification: string
      secret: string
    }): Promise<UserKey> => {
      const created = (
        await this.sql<UserKey[]>`
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
        await this.sql<UserKey[]>`
            UPDATE user_keys
            SET updated_at = NOW(), ${this.sql(this.sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
      if (updated) {
        await publicAPICache.userKey.set(updated.id, updated)
      }
      return updated
    },
    deleteOne: async (params: { id: number }): Promise<void> => {
      const deleted = await this.sql<UserKey[]>`
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
      // INDEX: idx_user_push_tokens_by_deleted_at (for deleted_at IS NULL filter)
      return await this.sql<UserPushToken[]>`
        SELECT *
        FROM user_push_tokens
        WHERE deleted_at IS NULL 
        ORDER BY created_at DESC`
    },
    findMany: async (params: {
      userId: number
    }): Promise<UserPushToken[]> => {
      // INDEX: idx_user_push_tokens_by_user_id_deleted_at (for user_id + deleted_at filter)
      return await this.sql<UserPushToken[]>`
        SELECT *
        FROM user_push_tokens
        WHERE deleted_at IS NULL AND user_id = ${params.userId} 
        ORDER BY created_at DESC`
    },
    findOne: async (
      { deviceId, userId }: { deviceId: string; userId: number },
    ): Promise<null | UserPushToken> => {
      // INDEX: idx_user_push_tokens_by_device_user (for device_id + user_id filter)
      return (
        await this.sql<
          UserPushToken[]
        >`SELECT * FROM user_push_tokens WHERE deleted_at is NULL AND device_id = ${deviceId} AND user_id = ${userId}`
      )[0]
    },
    createOne: async (params: UserPushTokenBase) => {
      return (
        await this.sql<UserPushToken[]>`
            INSERT INTO user_push_tokens
            ${this.sql(this.sanitize(params))}
            RETURNING *`
      )[0]
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserPushToken>
    }): Promise<UserPushToken> => {
      return (
        await this.sql<UserPushToken[]>`
            UPDATE user_push_tokens
            SET updated_at = NOW(), ${this.sql(this.sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
    },
    deleteOne: async (params: { deviceId: string; userId?: number }): Promise<void> => {
      // INDEX: idx_user_push_tokens_by_device_user (for device_id filter), idx_user_push_tokens_by_user_id_deleted_at (if userId provided)
      await this.sql<UserPushToken[]>`
        UPDATE user_push_tokens
          SET updated_at = NOW(), deleted_at = NOW()
          WHERE device_id = ${params.deviceId} ${
        params.userId ? this.sql`AND user_id = ${params.userId}` : this.sql``
      }
          RETURNING *`
    },
    deleteByUser: async (params: { userId: number }): Promise<void> => {
      // INDEX: idx_user_push_tokens_by_user_id_deleted_at (for user_id filter)
      await this.sql<UserPushToken[]>`
            UPDATE user_push_tokens
            SET updated_at = NOW(), deleted_at = NOW()
            WHERE user_id = ${params.userId}
            RETURNING *`
    },
  }

  userSettings = {
    // buildMethods generates: findOne (PK), findChanged (sync index), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<UserSettings, UserSettingsBase, Partial<UserSettingsBase>>(
      `user_settings`,
      publicAPICache.userSettings,
    ),
    findChanged: async (updatedAtGt: Date, userId: number): Promise<UserSettings[]> => {
      return this.sql<UserSettings[]>`
        SELECT * FROM user_settings 
        WHERE id = ${userId} AND updated_at > ${updatedAtGt}
        ORDER BY updated_at DESC
      `
    },
  }

  group = {
    // buildMethods generates: findOne (PK), findChanged (idx_groups_sync_retrieval), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<Group, GroupBase, Partial<GroupBase>>(
      `groups`,
      publicAPICache.group,
    ),
    findMany: async (userId: number): Promise<Group[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter and join)
      return this.sql<Group[]>`
        SELECT g.*
        FROM groups g
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND gm.deleted_at IS NULL
        ORDER BY g.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<Group[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter), idx_groups_sync_retrieval (for g.updated_at filter)
      return this.sql<Group[]>`
        SELECT g.*
        FROM groups g
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND gm.deleted_at IS NULL
        AND g.updated_at > ${updatedAtGt}
        ORDER BY g.created_at DESC
      `
    },
  }

  groupMembership = {
    // buildMethods generates: findOne (PK), findChanged (no sync index needed), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<GroupMembership, GroupMembershipBase, Partial<GroupMembershipBase>>(
      `group_memberships`,
      publicAPICache.groupMembership,
    ),
    findMany: async (userId: number): Promise<GroupMembership[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter)
      return this.sql<GroupMembership[]>`
        SELECT gm.*
        FROM group_memberships gm
        WHERE gm.user_id = ${userId}
        ORDER BY gm.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<GroupMembership[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter)
      return this.sql<GroupMembership[]>`
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
      // INDEX: idx_memberships_by_user_group (for user_id + group_id filter)
      const results = await this.sql<GroupMembership[]>`
        SELECT gm.*
        FROM group_memberships gm
        WHERE gm.user_id = ${userId}
        AND gm.group_id = ${groupId}
        AND gm.deleted_at IS NULL
        LIMIT 1
      `
      return results[0] || null
    },
    findUserIdsByGroup: async (groupId: number): Promise<number[]> => {
      // INDEX: idx_memberships_by_group (for gm.group_id filter)
      const results = await this.sql<{ user_id: number }[]>`
        SELECT gm.user_id
        FROM group_memberships gm
        WHERE gm.group_id = ${groupId}
        AND gm.deleted_at IS NULL
      `
      return results.map((r) => r.user_id)
    },
  }

  account = {
    // buildMethods generates: findOne (PK), findChanged (idx_accounts_sync_retrieval), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<Account, AccountBase, Partial<AccountBase>>(
      `accounts`,
      publicAPICache.account,
    ),
    findMany: async (userId: number): Promise<Account[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter and joins)
      return this.sql<Account[]>`
        SELECT a.*
        FROM accounts a
        JOIN groups g ON a.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND gm.deleted_at IS NULL
        ORDER BY a.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<Account[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter), idx_accounts_sync_retrieval (for a.updated_at filter)
      return this.sql<Account[]>`
        SELECT a.*
        FROM accounts a
        JOIN groups g ON a.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND gm.deleted_at IS NULL
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
    // buildMethods generates: findOne (PK), findChanged (no sync index needed), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<Category, CategoryBase, Partial<CategoryBase>>(
      `categories`,
      publicAPICache.category,
    ),
    findMany: async (userId: number): Promise<Category[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter), idx_categories_by_group (for c.group_id join)
      return this.sql<Category[]>`
        SELECT c.*
        FROM categories c
        JOIN groups g ON c.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND gm.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<Category[]> => {
      // INDEX: idx_memberships_by_user_group (for gm.user_id filter), idx_categories_by_group (for c.group_id join)
      return this.sql<Category[]>`
        SELECT c.*
        FROM categories c
        JOIN groups g ON c.group_id = g.id
        JOIN group_memberships gm ON g.id = gm.group_id
        WHERE gm.user_id = ${userId}
        AND gm.deleted_at IS NULL
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
    // buildMethods generates: findOne (PK), findChanged (no sync index needed), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<Tag, TagBase, Partial<TagBase>>(`tags`, publicAPICache.tag),
    findMany: async (_userId: number): Promise<Tag[]> => {
      // TODO: add group_id scoping
      // -- JOIN groups g ON t.group_id = g.id -- TODO: create tags.group_id
      // -- WHERE t.user_id = ${userId} -- TODO: create tags.group_id
      return this.sql<Tag[]>`
        SELECT t.*
        FROM tags t
        ORDER BY t.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date, _userId: number): Promise<Tag[]> => {
      // TODO: add group_id scoping
      // -- JOIN groups g ON t.group_id = g.id -- TODO: create tags.group_id
      // -- AND t.user_id = ${userId} -- TODO: create tags.group_id
      return this.sql<Tag[]>`
        SELECT t.*
        FROM tags t
        WHERE 1=1 
        AND t.updated_at > ${updatedAtGt}
        ORDER BY t.created_at DESC
      `
    },
  }

  transaction = {
    // buildMethods generates: findOne (PK), findChanged (idx_transactions_sync_retrieval), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<Transaction, TransactionCreate, Partial<TransactionCreate>>(
      `transactions`,
      publicAPICache.transaction,
    ),
    findMany: async (params: {
      filter: { userId: number; timestamp?: { gte?: Date; lte?: Date } }
      pagination?: { offset: number; limit: number }
    }): Promise<Transaction[]> => {
      // INDEX: idx_transactions_by_group (for t.group_id IN subquery), idx_memberships_by_user_group (for subquery), idx_transactions_by_timestamp (for ORDER BY timestamp)
      let timestampCondition = this.sql``
      if (params.filter.timestamp) {
        const conditions = []
        if (params.filter.timestamp.gte) {
          conditions.push(this.sql`t.timestamp >= ${params.filter.timestamp.gte}`)
        }
        if (params.filter.timestamp.lte) {
          conditions.push(this.sql`t.timestamp <= ${params.filter.timestamp.lte}`)
        }
        if (conditions.length > 0) {
          timestampCondition = this.sql`AND ${
            this.sql.unsafe(conditions.map(() => "?").join(" AND "))
          }`
          timestampCondition = this.sql`AND (${
            conditions.reduce((acc, cond, i) => i === 0 ? cond : this.sql`${acc} AND ${cond}`)
          })`
        }
      }

      return this.sql<Transaction[]>`
        SELECT t.*
        FROM transactions t
        WHERE t.group_id IN (
          SELECT group_id FROM group_memberships WHERE user_id = ${params.filter.userId} AND deleted_at IS NULL
        )
        ${timestampCondition}
        ORDER BY t.timestamp DESC
        ${params.pagination?.limit ? this.sql`LIMIT ${params.pagination.limit}` : this.sql``}
        ${params.pagination?.offset ? this.sql`OFFSET ${params.pagination.offset}` : this.sql``}
      `
    },
    findByLinkedTransactionCode: async (
      linkedTransactionCode: string,
      userId: number,
    ): Promise<Transaction[]> => {
      // INDEX: idx_transactions_linked_transaction_code (for linked_transaction_code), idx_transactions_by_group (for group_id IN subquery), idx_transactions_by_timestamp (for ORDER BY timestamp)
      return this.sql<Transaction[]>`
        SELECT t.*
        FROM transactions t
        WHERE t.linked_transaction_code = ${linkedTransactionCode}
        AND t.group_id IN (
          SELECT group_id FROM group_memberships WHERE user_id = ${userId} AND deleted_at IS NULL
        )
        ORDER BY t.timestamp DESC
      `
    },
    findByGroup: async (groupId: number, _userId: number): Promise<Transaction[]> => {
      // INDEX: idx_transactions_by_group (for t.group_id filter), idx_transactions_by_timestamp (for ORDER BY timestamp)
      return this.sql<Transaction[]>`
        SELECT t.*
        FROM transactions t
        WHERE t.group_id = ${groupId}
        ORDER BY t.timestamp DESC
      `
    },
    findByAccount: async (accountId: number, userId: number): Promise<Transaction[]> => {
      // INDEX: idx_transactions_by_account (for t.account_id filter), idx_transactions_by_group (for group_id IN subquery), idx_transactions_by_timestamp (for ORDER BY timestamp)
      return this.sql<Transaction[]>`
        SELECT t.*
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id = ${accountId}
        AND t.group_id IN (
          SELECT group_id FROM group_memberships WHERE user_id = ${userId} AND deleted_at IS NULL
        )
        ORDER BY t.timestamp DESC
      `
    },
    findChanged: async (updatedAtGt: Date, userId: number): Promise<Transaction[]> => {
      // INDEX: idx_transactions_sync_retrieval (for t.updated_at filter), idx_transactions_by_group (for group_id IN subquery), idx_transactions_by_timestamp (for ORDER BY timestamp)
      return this.sql<Transaction[]>`
        SELECT t.*
        FROM transactions t
        WHERE t.group_id IN (
          SELECT group_id FROM group_memberships WHERE user_id = ${userId} AND deleted_at IS NULL
        )
        AND t.updated_at > ${updatedAtGt}
        ORDER BY t.timestamp DESC
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
      transaction: TransactionCreate,
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
      // check categoryId - only required for non-transfers
      if (transaction.type !== 3 && transaction.categoryId) { // type 3 = TRANSFER
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

  currency = {
    // buildMethods generates: findOne (PK), findChanged (no sync index needed), createOne, updateOne, deleteOne, undeleteOne (PK)
    ...this.buildMethods<Currency, CurrencyBase, Partial<CurrencyBase>>(
      `currencies`,
      publicAPICache.currency,
    ),
    // Override findMany to support global currency data (no userId filtering)
    findMany: async (): Promise<Currency[]> => {
      // INDEX: idx_currencies_by_code (for ORDER BY code)
      return publicAPICache.currency.wrapMany(
        "all",
        async () =>
          this.sql<Currency[]>`
          SELECT * FROM currencies 
          WHERE deleted_at IS NULL 
          ORDER BY type ASC, code ASC
        `,
      )
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

      // Handle special case for global currency table
      if (model === "currency") {
        if ("findChanged" in db[model] && typeof db[model].findChanged === "function") {
          data = await db[model].findChanged(lastSyncAtDate)
        } else {
          data = await db[model].findMany()
        }
      } else if (model === "userSettings") {
        // UserSettings is per-user, so find the specific user's settings
        const userSettings = await db[model].findOne({ id: userId })
        data = userSettings ? [userSettings] : []
      } else {
        if ("findChanged" in db[model] && typeof db[model].findChanged === "function") {
          data = await db[model].findChanged(lastSyncAtDate, userId)
        } else {
          // Handle special case for transaction findMany which uses new parameter structure
          if (model === "transaction") {
            data = await db[model].findMany({ filter: { userId } })
          } else {
            data = await db[model].findMany(userId)
          }
        }
      }
      callback(model, data)
    }
  }
}

export const db = new DbService()
await db.connect()
console.log(`✅ Connected to DB`)
