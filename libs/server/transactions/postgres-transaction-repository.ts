import type postgres from "postgres"
import {
  assertCanWriteTransactions,
  assertEntryReferences,
  deriveAmounts,
  type EntryRateLookup,
  type EntryReferences,
  type Ledger,
  type LedgerCategory,
  type LedgerRow,
  summarizeLedger,
  type Transaction,
  TRANSACTION_EVENTS,
  type TransactionCreateInput,
  type TransactionDeleteInput,
  TransactionError,
  type TransactionFields,
  type TransactionRepository,
  type TransactionRestoreInput,
  type TransactionUpdateInput,
  TransactionVersionConflictError,
  type TransactionWriteResult,
} from "@domain/transactions"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "@server/groups/group-change-log.ts"
import { amountOf } from "@server/accounts/postgres-account-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import type { GroupRole } from "@domain/groups"
import { assertRoomFor } from "@domain/billing"

/** A row as postgres.js reads it: the BIGINT columns come as decimal text, the date as text. */
interface TransactionRow extends postgres.Row, Omit<Transaction, "accountAmount" | "amount"> {
  accountAmount: string
  amount: string
}

/** Reads a rate on a day, as the rate repository does. */
interface RateReader {
  lookup: PostgresRateRepository["lookup"]
}

/**
 * Records an entry's change on its group. A group deleted since the role check is answered as a
 * missing group, and the write rolls back with it.
 */
async function recordTransactionChange(
  sql: postgres.TransactionSql,
  groupId: string,
  actorId: number,
  eventKind: string,
): Promise<string> {
  try {
    return await recordGroupChange(sql, groupId, actorId, eventKind)
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new TransactionError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Checks, in the write's own transaction, that the actor may still change the entries, and returns
 * their role. The lock it takes on the group makes every other write of the household wait, so an
 * account or a category cannot change under the entry being written.
 */
async function assertWriterNow(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
): Promise<GroupRole> {
  try {
    const role = await lockActorRole(transaction, groupId, actorId)
    assertCanWriteTransactions(role)
    return role as GroupRole
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new TransactionError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Entries in Postgres. Every write runs in one transaction that checks the actor's role on the
 * locked group row (`lockActorRole`), reads the entry's account and category inside the household
 * under that lock, derives the stored amounts ({@link deriveAmounts}) and records the change on the
 * group. Every statement names the group, so an id from another household matches no row; the
 * table's foreign keys on `(group_id, account_id)` and `(group_id, category_id)` hold the same if a
 * statement forgot it (R17).
 *
 * Entries write no audit event: the group's activity lists changes to its setup (members,
 * accounts, categories), and an entry's author and editor stay on its row.
 */
export class PostgresTransactionRepository implements TransactionRepository {
  private readonly rates: RateReader

  constructor(private readonly sql: postgres.Sql, rates?: RateReader) {
    this.rates = rates ?? new PostgresRateRepository(sql)
  }

  async get(groupId: string, id: string): Promise<Transaction | null> {
    const row = (
      await this.sql<TransactionRow[]>`
        SELECT ${this.columns()} FROM transactions
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    return row ? toTransaction(row) : null
  }

  async count(groupId: string): Promise<number> {
    const [{ count }] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM transactions
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    `
    return count
  }

  async timeZoneOf(groupId: string): Promise<string | null> {
    const row = (
      await this.sql<{ timeZone: string }[]>`
        SELECT time_zone FROM groups WHERE id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    return row?.timeZone ?? null
  }

  async create(input: TransactionCreateInput, actorId: number): Promise<TransactionWriteResult> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransactionRepository(transaction, this.rates)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const existing = await repository.find(input.groupId, input.id)
      if (existing) {
        if (
          existing.deletedAt === null && existing.createdByUserId === actorId &&
          sameEntry(existing, input)
        ) {
          return { transaction: existing, created: false }
        }
        throw new TransactionError("ID_ALREADY_EXISTS", "Transaction id is already in use")
      }
      const references = await repository.references(input)
      assertEntryReferences(input.kind, references)
      const amounts = await deriveAmounts(input, references.account.currency, null, repository.rate)
      // The id is the primary key: another household's entry under it inserts nothing.
      const inserted = (
        await transaction<{ id: string }[]>`
          INSERT INTO transactions (
            id, group_id, account_id, category_id, kind, account_amount, amount, currency,
            converted, memo, date, change_sequence, created_by_user_id, updated_by_user_id
          ) VALUES (
            ${input.id}, ${input.groupId}, ${input.accountId}, ${input.categoryId}, ${input.kind},
            ${amounts.accountAmount}, ${amounts.amount}, ${input.currency}, ${amounts.converted},
            ${input.memo}, ${input.date}::date, 1, ${actorId}, ${actorId}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `
      )[0]
      if (!inserted) {
        throw new TransactionError("ID_ALREADY_EXISTS", "Transaction id is already in use")
      }
      await repository.assertRoom(input.groupId, input.allowance, role)
      const created = await repository.stamp(
        transaction,
        input,
        actorId,
        TRANSACTION_EVENTS.created,
      )
      return { transaction: created, created: true }
    })
  }

  async update(input: TransactionUpdateInput, actorId: number): Promise<Transaction> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransactionRepository(transaction, this.rates)
      await assertWriterNow(transaction, input.groupId, actorId)
      const current = (
        await transaction<TransactionRow[]>`
          SELECT ${repository.columns()} FROM transactions
          WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          FOR UPDATE
        `
      )[0]
      if (!current) throw new TransactionError("TRANSACTION_NOT_FOUND", "Transaction not found")
      if (current.version !== input.expectedVersion) {
        throw new TransactionVersionConflictError(current.version)
      }
      const references = await repository.references(input)
      assertEntryReferences(input.kind, references)
      const amounts = await deriveAmounts(
        input,
        references.account.currency,
        toTransaction(current),
        repository.rate,
      )
      await transaction`
        UPDATE transactions
        SET account_id = ${input.accountId}, category_id = ${input.categoryId},
            kind = ${input.kind}, account_amount = ${amounts.accountAmount},
            amount = ${amounts.amount}, currency = ${input.currency},
            converted = ${amounts.converted}, memo = ${input.memo}, date = ${input.date}::date,
            version = version + 1, updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId}
      `
      return await repository.stamp(transaction, input, actorId, TRANSACTION_EVENTS.updated)
    })
  }

  async delete(input: TransactionDeleteInput, actorId: number): Promise<Transaction> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransactionRepository(transaction, this.rates)
      await assertWriterNow(transaction, input.groupId, actorId)
      const [row] = await transaction<{ id: string }[]>`
        UPDATE transactions
        SET deleted_at = CURRENT_TIMESTAMP,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          AND version = ${input.expectedVersion}
        RETURNING id
      `
      if (!row) return await repository.refuseStaleWrite(input.groupId, input.id)
      return await repository.stamp(transaction, input, actorId, TRANSACTION_EVENTS.deleted)
    })
  }

  async restore(input: TransactionRestoreInput, actorId: number): Promise<Transaction> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransactionRepository(transaction, this.rates)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const [row] = await transaction<{ id: string }[]>`
        UPDATE transactions
        SET deleted_at = NULL,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NOT NULL
        RETURNING id
      `
      if (!row) throw new TransactionError("TRANSACTION_NOT_FOUND", "Transaction not found")
      await repository.assertRoom(input.groupId, input.allowance, role)
      return await repository.stamp(transaction, input, actorId, TRANSACTION_EVENTS.restored)
    })
  }

  /**
   * The household's live entries from `from` to `to` as one {@link Ledger} in `currency`. The
   * database sums them per category, day and currency; {@link summarizeLedger} converts each sum
   * at its day's rate. An entry paid in `currency` counts its original amount, exact; any other
   * counts what moved in its account, in the account's currency (R4).
   */
  async ledger(groupId: string, currency: string, from: string, to: string): Promise<Ledger> {
    const [rows, categories] = await Promise.all([
      this.sql<(Omit<LedgerRow, "amount"> & { amount: string })[]>`
        SELECT
          transactions.category_id,
          CASE WHEN transactions.currency = ${currency} THEN transactions.currency
            ELSE accounts.currency END AS currency,
          to_char(transactions.date, 'YYYY-MM-DD') AS date,
          sum(
            CASE WHEN transactions.currency = ${currency} THEN transactions.amount
              ELSE transactions.account_amount END
          )::text AS amount
        FROM transactions
        INNER JOIN accounts
          ON accounts.id = transactions.account_id AND accounts.group_id = transactions.group_id
        WHERE transactions.group_id = ${groupId} AND transactions.deleted_at IS NULL
          AND transactions.date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1, 2, 3
      `,
      this.sql<LedgerCategory[]>`
        SELECT id, kind, parent_id FROM categories WHERE group_id = ${groupId}
      `,
    ])
    return await summarizeLedger(
      // A sum past the safe range reads as an unsafe number, which the summary reports as too large.
      rows.map((row) => ({ ...row, amount: Number(row.amount) })),
      categories,
      { currency, from, to },
      this.rate,
    )
  }

  /** The rate lookup {@link deriveAmounts} and {@link summarizeLedger} take. */
  private readonly rate: EntryRateLookup = async (base, quote, date) => {
    const lookup = await this.rates.lookup(base, quote, date)
    return lookup.found ? lookup.rate : null
  }

  /** The entry's account, live, and its category, archived ones included, inside the household. */
  private async references(
    input: { groupId: string; accountId: string; categoryId: string },
  ): Promise<EntryReferences> {
    const [account, category] = await Promise.all([
      this.sql<{ currency: string }[]>`
        SELECT currency FROM accounts
        WHERE id = ${input.accountId} AND group_id = ${input.groupId} AND deleted_at IS NULL
      `,
      this.sql<{ kind: number }[]>`
        SELECT kind FROM categories WHERE id = ${input.categoryId} AND group_id = ${input.groupId}
      `,
    ])
    return { account: account[0] ?? null, category: category[0] ?? null }
  }

  /**
   * Refuses a write that just added a live entry to a household past its plan's `allowance`. It
   * runs after the write, under the lock on the household that every other entry write takes. No
   * cap needs no count.
   */
  private async assertRoom(
    groupId: string,
    allowance: number | null,
    role: GroupRole,
  ): Promise<void> {
    if (allowance === null) return
    assertRoomFor("maxTransactions", allowance, (await this.count(groupId)) - 1, role)
  }

  /** An entry of the group, live or deleted. */
  private async find(groupId: string, id: string): Promise<Transaction | null> {
    const row = (
      await this.sql<TransactionRow[]>`
        SELECT ${this.columns()} FROM transactions WHERE id = ${id} AND group_id = ${groupId}
      `
    )[0]
    return row ? toTransaction(row) : null
  }

  /**
   * Records the change of an entry written in this transaction on its group, stores the sequence
   * on the entry and returns the entry as it now reads.
   */
  private async stamp(
    transaction: postgres.TransactionSql,
    input: { groupId: string; id: string },
    actorId: number,
    eventKind: string,
  ): Promise<Transaction> {
    const sequence = await recordTransactionChange(transaction, input.groupId, actorId, eventKind)
    const row = (
      await this.sql<TransactionRow[]>`
        UPDATE transactions SET change_sequence = ${sequence}::bigint
        WHERE id = ${input.id} AND group_id = ${input.groupId}
        RETURNING ${this.columns()}
      `
    )[0]
    if (!row) {
      throw new Error(`Transaction ${input.id} vanished while its change was being recorded`)
    }
    return toTransaction(row)
  }

  /** Explains why a write matched no row: the entry is gone, or it is at another version. */
  private async refuseStaleWrite(groupId: string, id: string): Promise<never> {
    const current = (
      await this.sql<{ version: number }[]>`
        SELECT version FROM transactions
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    if (!current) throw new TransactionError("TRANSACTION_NOT_FOUND", "Transaction not found")
    throw new TransactionVersionConflictError(current.version)
  }

  private columns() {
    return this.sql`
      transactions.id,
      transactions.group_id,
      transactions.account_id,
      transactions.category_id,
      transactions.kind,
      transactions.account_amount::text AS account_amount,
      transactions.amount::text AS amount,
      transactions.currency,
      transactions.converted,
      transactions.memo,
      to_char(transactions.date, 'YYYY-MM-DD') AS date,
      transactions.version,
      transactions.change_sequence::text AS change_sequence,
      transactions.created_by_user_id,
      transactions.updated_by_user_id,
      transactions.created_at,
      transactions.updated_at,
      transactions.deleted_at
    `
  }
}

/** Whether a stored entry is what a retried create asks for, sign and stated account amount aside. */
function sameEntry(existing: Transaction, input: TransactionFields): boolean {
  return existing.accountId === input.accountId && existing.categoryId === input.categoryId &&
    existing.kind === input.kind && Math.abs(existing.amount) === input.amount &&
    existing.currency === input.currency && existing.memo === input.memo &&
    existing.date === input.date &&
    (input.accountAmount === undefined || Math.abs(existing.accountAmount) === input.accountAmount)
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    groupId: row.groupId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    kind: row.kind,
    accountAmount: amountOf(row.accountAmount),
    amount: amountOf(row.amount),
    currency: row.currency,
    converted: row.converted,
    memo: row.memo,
    date: row.date,
    version: row.version,
    changeSequence: row.changeSequence,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}
