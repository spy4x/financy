import type postgres from "postgres"
import {
  type Account,
  ACCOUNT_EVENTS,
  type AccountArchiveInput,
  type AccountCreateInput,
  type AccountDeleteInput,
  AccountError,
  type AccountRepository,
  type AccountRestoreInput,
  type AccountSetDefaultInput,
  type AccountUpdateInput,
  AccountVersionConflictError,
  type AccountWriteResult,
  assertAccountRoom,
  assertCanWriteAccounts,
  type ListedAccount,
} from "@domain/accounts"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "@server/groups/group-change-log.ts"
import { writeAuditEvent } from "@server/groups/audit.ts"
import type { AuditDetails, GroupRole } from "@domain/groups"
import { assertRoomFor } from "@domain/billing"

/** A row as postgres.js reads it: the two BIGINT columns come as decimal text. */
interface AccountRow extends postgres.Row, Omit<Account, "startingBalance"> {
  startingBalance: string
}

interface ListedAccountRow extends AccountRow {
  balance: string
}

/**
 * Records an account's change on its group. A group deleted since the role check is answered as a
 * missing group, and the write rolls back with it.
 */
async function recordAccountChange(
  sql: postgres.TransactionSql,
  groupId: string,
  actorId: number,
  eventKind: string,
): Promise<string> {
  try {
    return await recordGroupChange(sql, groupId, actorId, eventKind)
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new AccountError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Checks, in the write's own transaction, that the actor may still change the accounts, and
 * returns their role.
 */
async function assertWriterNow(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
): Promise<GroupRole> {
  try {
    const role = await lockActorRole(transaction, groupId, actorId)
    assertCanWriteAccounts(role)
    return role as GroupRole
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new AccountError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Accounts in Postgres. Every write runs in one transaction that checks the actor's role on the
 * locked membership row (`lockActorRole`), records the change on the group (`recordGroupChange`)
 * and writes its audit event, like a tag's. Every statement names the group, so an id from another
 * household matches no row and answers `ACCOUNT_NOT_FOUND`.
 *
 * A household holds at most `ACCOUNT_MAX_PER_GROUP` live accounts. A create and a restore count
 * them after the write, in the same transaction: the group row `lockActorRole` locks makes a second
 * write of the same household wait, then count this one.
 *
 * The balance is computed here, in SQL, for one household: the starting balance plus the
 * account's live entries dated on or before the day asked (R9); transfers will add their sums to
 * {@link balanceOf}. An account's currency is fixed once an entry names it (R10), and an account
 * an entry names, live or in the trash, is archived rather than deleted.
 */
export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async list(groupId: string, deleted = false, on?: string): Promise<ListedAccount[]> {
    const rows = await this.sql<ListedAccountRow[]>`
      SELECT ${this.columns()}, ${this.balanceOf(on)} AS balance
      FROM accounts
      WHERE group_id = ${groupId}
        AND ${deleted ? this.sql`deleted_at IS NOT NULL` : this.sql`deleted_at IS NULL`}
      ORDER BY ${deleted ? this.sql`deleted_at DESC,` : this.sql``} lower(name), id
    `
    return rows.map(toListedAccount)
  }

  async get(groupId: string, id: string, on?: string): Promise<ListedAccount | null> {
    const row = (
      await this.sql<ListedAccountRow[]>`
        SELECT ${this.columns()}, ${this.balanceOf(on)} AS balance
        FROM accounts
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    return row ? toListedAccount(row) : null
  }

  /**
   * Refuses a write that just added a live account to a household past its caps: Financy's own
   * (`ACCOUNT_MAX_PER_GROUP`) and the plan's `allowance`. It runs after the write, under the lock
   * on the household that every other account write takes.
   */
  async assertRoom(groupId: string, allowance: number | null, role: GroupRole): Promise<void> {
    const count = await this.count(groupId)
    assertAccountRoom(count)
    assertRoomFor("maxAccounts", allowance, count - 1, role)
  }

  /** How many live accounts the household holds, archived ones included. */
  async count(groupId: string): Promise<number> {
    const [{ count }] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM accounts WHERE group_id = ${groupId} AND deleted_at IS NULL
    `
    return count
  }

  async create(input: AccountCreateInput, actorId: number): Promise<AccountWriteResult> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresAccountRepository(transaction)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      // The id is the primary key, so a retry of this request inserts nothing.
      const inserted = (
        await transaction<{ id: string }[]>`
          INSERT INTO accounts (
            id, group_id, name, kind, currency, starting_balance, change_sequence,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            ${input.id}, ${input.groupId}, ${input.name}, ${input.kind}, ${input.currency},
            ${input.startingBalance}, 1, ${actorId}, ${actorId}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `
      )[0]
      if (inserted) {
        await repository.assertRoom(input.groupId, input.allowance, role)
        await repository.audit(transaction, ACCOUNT_EVENTS.created, input, actorId, {
          name: input.name,
        })
        const account = await repository.stamp(transaction, input, actorId, ACCOUNT_EVENTS.created)
        return { account, created: true }
      }
      const existing = await repository.find(input.groupId, input.id)
      if (
        existing && existing.deletedAt === null && existing.createdByUserId === actorId &&
        existing.name === input.name && existing.kind === input.kind &&
        existing.currency === input.currency && existing.startingBalance === input.startingBalance
      ) {
        return { account: existing, created: false }
      }
      throw new AccountError("ID_ALREADY_EXISTS", "Account id is already in use")
    })
  }

  async update(input: AccountUpdateInput, actorId: number): Promise<Account> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresAccountRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      // Under the household's lock no entry can be added in between: a currency change is refused
      // while any entry, live or in the trash, names the account (R10).
      const current = await repository.usage(input)
      if (current?.hasEntries && current.currency !== input.currency) {
        throw new AccountError(
          "CURRENCY_LOCKED",
          "An account's currency is fixed once it has entries",
          {
            currency: { code: "locked" },
          },
        )
      }
      const [previous] = await transaction<{ name: string }[]>`
        UPDATE accounts
        SET name = ${input.name},
            kind = ${input.kind},
            currency = ${input.currency},
            starting_balance = ${input.startingBalance},
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        FROM (
          SELECT id, name FROM accounts
          WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
            AND version = ${input.expectedVersion}
          FOR UPDATE
        ) AS previous
        WHERE accounts.id = previous.id
        RETURNING previous.name AS name
      `
      if (!previous) return await repository.refuseStaleWrite(input.groupId, input.id)
      await repository.audit(transaction, ACCOUNT_EVENTS.updated, input, actorId, {
        name: input.name,
        ...(previous.name !== input.name && { from: previous.name }),
      })
      return await repository.stamp(transaction, input, actorId, ACCOUNT_EVENTS.updated)
    })
  }

  async archive(input: AccountArchiveInput, actorId: number): Promise<Account> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresAccountRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      // Archiving takes the default flag off: an account hidden from the pickers cannot be the one
      // quick entry picks. Archiving an archived account keeps its first date.
      const [row] = await transaction<{ name: string }[]>`
        UPDATE accounts
        SET archived_at = ${
        input.archived ? transaction`COALESCE(archived_at, CURRENT_TIMESTAMP)` : null
      },
            is_default = ${input.archived ? false : transaction`is_default`},
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          AND version = ${input.expectedVersion}
        RETURNING name
      `
      if (!row) return await repository.refuseStaleWrite(input.groupId, input.id)
      const kind = input.archived ? ACCOUNT_EVENTS.archived : ACCOUNT_EVENTS.unarchived
      await repository.audit(transaction, kind, input, actorId, { name: row.name })
      return await repository.stamp(transaction, input, actorId, kind)
    })
  }

  async setDefault(input: AccountSetDefaultInput, actorId: number): Promise<Account> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresAccountRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      const current = (
        await transaction<{ version: number; archivedAt: Date | null; name: string }[]>`
          SELECT version, archived_at, name FROM accounts
          WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          FOR UPDATE
        `
      )[0]
      if (!current) throw new AccountError("ACCOUNT_NOT_FOUND", "Account not found")
      if (current.version !== input.expectedVersion) {
        throw new AccountVersionConflictError(current.version)
      }
      if (input.isDefault && current.archivedAt !== null) {
        throw new AccountError("ACCOUNT_ARCHIVED", "An archived account cannot be the default")
      }
      const kind = input.isDefault ? ACCOUNT_EVENTS.defaultSet : ACCOUNT_EVENTS.defaultCleared
      // The account that had the flag loses it in the same change, so the partial unique index
      // never sees two, and its version moves so a device holding it rereads it.
      const sequence = await recordAccountChange(transaction, input.groupId, actorId, kind)
      if (input.isDefault) {
        await transaction`
          UPDATE accounts
          SET is_default = false, version = version + 1, change_sequence = ${sequence}::bigint,
              updated_by_user_id = ${actorId}, updated_at = CURRENT_TIMESTAMP
          WHERE group_id = ${input.groupId} AND is_default AND id <> ${input.id}
        `
      }
      const row = (
        await transaction<AccountRow[]>`
          UPDATE accounts
          SET is_default = ${input.isDefault}, version = version + 1,
              change_sequence = ${sequence}::bigint, updated_by_user_id = ${actorId},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${input.id}
          RETURNING ${repository.columns()}
        `
      )[0]
      await repository.audit(transaction, kind, input, actorId, { name: current.name })
      return toAccount(row)
    })
  }

  async delete(input: AccountDeleteInput, actorId: number): Promise<Account> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresAccountRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      // An entry, live or in the trash, keeps its account: the person archives it instead. A purge
      // could not remove the row anyway while an entry names it.
      if ((await repository.usage(input))?.hasEntries) {
        throw new AccountError(
          "ACCOUNT_HAS_TRANSACTIONS",
          "The account has entries: archive it instead",
        )
      }
      // A deleted account cannot stay the default: the household is then left with none.
      const [row] = await transaction<{ name: string }[]>`
        UPDATE accounts
        SET deleted_at = CURRENT_TIMESTAMP,
            is_default = false,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          AND version = ${input.expectedVersion}
        RETURNING name
      `
      if (!row) return await repository.refuseStaleWrite(input.groupId, input.id)
      await repository.audit(transaction, ACCOUNT_EVENTS.deleted, input, actorId, {
        name: row.name,
      })
      return await repository.stamp(transaction, input, actorId, ACCOUNT_EVENTS.deleted)
    })
  }

  async restore(input: AccountRestoreInput, actorId: number): Promise<Account> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresAccountRepository(transaction)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const [row] = await transaction<{ name: string }[]>`
        UPDATE accounts
        SET deleted_at = NULL,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NOT NULL
        RETURNING name
      `
      if (!row) throw new AccountError("ACCOUNT_NOT_FOUND", "Account not found")
      await repository.assertRoom(input.groupId, input.allowance, role)
      await repository.audit(transaction, ACCOUNT_EVENTS.restored, input, actorId, {
        name: row.name,
      })
      return await repository.stamp(transaction, input, actorId, ACCOUNT_EVENTS.restored)
    })
  }

  /**
   * The live account a write names at the version it was edited at, and whether any entry names
   * it; `null` otherwise, so the write itself answers not found or a version conflict.
   */
  private async usage(
    input: { groupId: string; id: string; expectedVersion: number },
  ): Promise<{ currency: string; hasEntries: boolean } | null> {
    const row = (
      await this.sql<{ currency: string; hasEntries: boolean }[]>`
        SELECT accounts.currency, EXISTS (
          SELECT 1 FROM transactions WHERE transactions.account_id = accounts.id
        ) AS has_entries
        FROM accounts
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          AND version = ${input.expectedVersion}
      `
    )[0]
    return row ?? null
  }

  /** An account of the group, live or deleted. */
  private async find(groupId: string, id: string): Promise<Account | null> {
    const row = (
      await this.sql<AccountRow[]>`
        SELECT ${this.columns()} FROM accounts WHERE id = ${id} AND group_id = ${groupId}
      `
    )[0]
    return row ? toAccount(row) : null
  }

  private async audit(
    transaction: postgres.TransactionSql,
    eventKind: string,
    input: { groupId: string; id: string; requestId?: string },
    actorId: number,
    details: AuditDetails,
  ): Promise<void> {
    await writeAuditEvent(transaction, {
      eventKind,
      actorId,
      groupId: input.groupId,
      requestId: input.requestId,
      entityType: "account",
      entityId: input.id,
      details,
    })
  }

  /**
   * Records the change of an account written in this transaction on its group, stores the
   * sequence on the account and returns the account as it now reads.
   */
  private async stamp(
    transaction: postgres.TransactionSql,
    input: { groupId: string; id: string },
    actorId: number,
    eventKind: string,
  ): Promise<Account> {
    const sequence = await recordAccountChange(transaction, input.groupId, actorId, eventKind)
    const row = (
      await this.sql<AccountRow[]>`
        UPDATE accounts SET change_sequence = ${sequence}::bigint
        WHERE id = ${input.id} AND group_id = ${input.groupId}
        RETURNING ${this.columns()}
      `
    )[0]
    if (!row) throw new Error(`Account ${input.id} vanished while its change was being recorded`)
    return toAccount(row)
  }

  /** Explains why a write matched no row: the account is gone, or it is at another version. */
  private async refuseStaleWrite(groupId: string, id: string): Promise<never> {
    const current = (
      await this.sql<{ version: number }[]>`
        SELECT version FROM accounts
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    if (!current) throw new AccountError("ACCOUNT_NOT_FOUND", "Account not found")
    throw new AccountVersionConflictError(current.version)
  }

  /**
   * The balance of the `accounts` row in scope, as decimal text: the starting balance plus the
   * account's live entries dated on or before `on` (`YYYY-MM-DD`), by default today in the
   * household's time zone (R9, R14). Transfers add their sums here.
   */
  private balanceOf(on?: string) {
    const day = on === undefined
      ? this.sql`(
          SELECT (CURRENT_TIMESTAMP AT TIME ZONE groups.time_zone)::date
          FROM groups WHERE groups.id = accounts.group_id
        )`
      : this.sql`${on}::date`
    return this.sql`(
      accounts.starting_balance + COALESCE((
        SELECT sum(transactions.account_amount) FROM transactions
        WHERE transactions.account_id = accounts.id AND transactions.deleted_at IS NULL
          AND transactions.date <= ${day}
      ), 0)
    )::text`
  }

  private columns() {
    return this.sql`
      accounts.id,
      accounts.group_id,
      accounts.name,
      accounts.kind,
      accounts.currency,
      accounts.starting_balance::text AS starting_balance,
      accounts.archived_at,
      accounts.is_default,
      accounts.version,
      accounts.change_sequence::text AS change_sequence,
      accounts.created_by_user_id,
      accounts.updated_by_user_id,
      accounts.created_at,
      accounts.updated_at,
      accounts.deleted_at
    `
  }
}

/**
 * An amount read as decimal text, as a number. The column's `CHECK` keeps a starting balance safe;
 * a derived sum past the safe range throws instead of rounding.
 */
export function amountOf(text: string): number {
  const amount = Number(text)
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Amount ${text} is outside the safe-integer range`)
  }
  return amount
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    startingBalance: amountOf(row.startingBalance),
    archivedAt: row.archivedAt,
    isDefault: row.isDefault,
    version: row.version,
    changeSequence: row.changeSequence,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

function toListedAccount(row: ListedAccountRow): ListedAccount {
  return { ...toAccount(row), balance: amountOf(row.balance) }
}
