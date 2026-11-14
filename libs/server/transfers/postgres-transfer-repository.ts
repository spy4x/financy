import type postgres from "postgres"
import {
  assertCanWriteTransfers,
  assertTransferReferences,
  deriveTransferAmounts,
  type Transfer,
  TRANSFER_EVENTS,
  type TransferCreateInput,
  type TransferDeleteInput,
  TransferError,
  type TransferFields,
  type TransferReferences,
  type TransferRepository,
  type TransferRestoreInput,
  type TransferUpdateInput,
  TransferVersionConflictError,
  type TransferWriteResult,
} from "@domain/transfers"
import type { EntryRateLookup } from "@domain/transactions"
import type { GroupRole } from "@domain/groups"
import { assertRoomFor } from "@domain/billing"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "@server/groups/group-change-log.ts"
import { amountOf } from "@server/accounts/postgres-account-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { countPlanTransactions } from "@server/transactions/plan-count.ts"

/** A row as postgres.js reads it: the BIGINT columns come as decimal text, the date as text. */
interface TransferRow extends postgres.Row, Omit<Transfer, "sentAmount" | "receivedAmount"> {
  sentAmount: string
  receivedAmount: string
}

/** Reads a rate on a day, as the rate repository does. */
interface RateReader {
  lookup: PostgresRateRepository["lookup"]
}

/**
 * Checks, in the write's own transaction, that the actor may still change the household's
 * transfers, and returns their role. The lock it takes on the group makes every other write of the
 * household wait, so an account cannot change or go under the transfer being written. A group gone
 * since the handler's check is answered as a missing group.
 */
async function assertWriterNow(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
): Promise<GroupRole> {
  try {
    const role = await lockActorRole(transaction, groupId, actorId)
    assertCanWriteTransfers(role)
    return role as GroupRole
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new TransferError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Transfers in Postgres, written like entries (`postgres-transaction-repository.ts`). Every write
 * runs in one transaction that checks the actor's role on the locked group row (`lockActorRole`),
 * reads both accounts inside the household under that lock, derives the stored amounts
 * ({@link deriveTransferAmounts}) and records the change on the group. Every statement names the
 * group, so an id from another household matches no row; the table's foreign keys on
 * `(group_id, from_account_id)` and `(group_id, to_account_id)` hold the same if a statement forgot
 * it (R17). Transfers write no audit event, as entries write none.
 */
export class PostgresTransferRepository implements TransferRepository {
  private readonly rates: RateReader

  constructor(private readonly sql: postgres.Sql, rates?: RateReader) {
    this.rates = rates ?? new PostgresRateRepository(sql)
  }

  async get(groupId: string, id: string): Promise<Transfer | null> {
    const row = (
      await this.sql<TransferRow[]>`
        SELECT ${this.columns()} FROM transfers
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    return row ? toTransfer(row) : null
  }

  async count(groupId: string): Promise<number> {
    const [{ count }] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM transfers
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

  async create(input: TransferCreateInput, actorId: number): Promise<TransferWriteResult> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransferRepository(transaction, this.rates)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const existing = await repository.find(input.groupId, input.id)
      if (existing) {
        if (
          existing.deletedAt === null && existing.createdByUserId === actorId &&
          sameTransfer(existing, input)
        ) {
          return { transfer: existing, created: false }
        }
        throw new TransferError("ID_ALREADY_EXISTS", "Transfer id is already in use")
      }
      const references = await repository.references(input)
      assertTransferReferences(input, references)
      const amounts = await deriveTransferAmounts(
        input,
        references.from.currency,
        references.to.currency,
        null,
        repository.rate,
      )
      // The id is the primary key: another household's transfer under it inserts nothing.
      const inserted = (
        await transaction<{ id: string }[]>`
          INSERT INTO transfers (
            id, group_id, from_account_id, to_account_id, sent_amount, received_amount, converted,
            memo, date, change_sequence, created_by_user_id, updated_by_user_id
          ) VALUES (
            ${input.id}, ${input.groupId}, ${input.fromAccountId}, ${input.toAccountId},
            ${amounts.sentAmount}, ${amounts.receivedAmount}, ${amounts.converted}, ${input.memo},
            ${input.date}::date, 1, ${actorId}, ${actorId}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `
      )[0]
      if (!inserted) throw new TransferError("ID_ALREADY_EXISTS", "Transfer id is already in use")
      await repository.assertRoom(input.groupId, input.allowance, role)
      const created = await repository.stamp(transaction, input, actorId, TRANSFER_EVENTS.created)
      return { transfer: created, created: true }
    })
  }

  async update(input: TransferUpdateInput, actorId: number): Promise<Transfer> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransferRepository(transaction, this.rates)
      await assertWriterNow(transaction, input.groupId, actorId)
      const current = (
        await transaction<TransferRow[]>`
          SELECT ${repository.columns()} FROM transfers
          WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          FOR UPDATE
        `
      )[0]
      if (!current) throw new TransferError("TRANSFER_NOT_FOUND", "Transfer not found")
      if (current.version !== input.expectedVersion) {
        throw new TransferVersionConflictError(current.version)
      }
      const references = await repository.references(input)
      assertTransferReferences(input, references)
      const amounts = await deriveTransferAmounts(
        input,
        references.from.currency,
        references.to.currency,
        toTransfer(current),
        repository.rate,
      )
      await transaction`
        UPDATE transfers
        SET from_account_id = ${input.fromAccountId}, to_account_id = ${input.toAccountId},
            sent_amount = ${amounts.sentAmount}, received_amount = ${amounts.receivedAmount},
            converted = ${amounts.converted}, memo = ${input.memo}, date = ${input.date}::date,
            version = version + 1, updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId}
      `
      return await repository.stamp(transaction, input, actorId, TRANSFER_EVENTS.updated)
    })
  }

  async delete(input: TransferDeleteInput, actorId: number): Promise<Transfer> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransferRepository(transaction, this.rates)
      await assertWriterNow(transaction, input.groupId, actorId)
      const [row] = await transaction<{ id: string }[]>`
        UPDATE transfers
        SET deleted_at = CURRENT_TIMESTAMP,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          AND version = ${input.expectedVersion}
        RETURNING id
      `
      if (!row) return await repository.refuseStaleWrite(input.groupId, input.id)
      return await repository.stamp(transaction, input, actorId, TRANSFER_EVENTS.deleted)
    })
  }

  async restore(input: TransferRestoreInput, actorId: number): Promise<Transfer> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresTransferRepository(transaction, this.rates)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const [row] = await transaction<{ id: string }[]>`
        UPDATE transfers
        SET deleted_at = NULL,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NOT NULL
        RETURNING id
      `
      if (!row) throw new TransferError("TRANSFER_NOT_FOUND", "Transfer not found")
      await repository.assertRoom(input.groupId, input.allowance, role)
      return await repository.stamp(transaction, input, actorId, TRANSFER_EVENTS.restored)
    })
  }

  /** The rate lookup {@link deriveTransferAmounts} takes: the rate of a day, or the latest earlier. */
  private readonly rate: EntryRateLookup = async (base, quote, date) => {
    const lookup = await this.rates.lookup(base, quote, date)
    return lookup.found ? lookup.rate : null
  }

  /**
   * Both of the transfer's accounts inside the household, live ones only: archived ones are
   * accepted, deleted ones and another household's read as missing (R17).
   */
  private async references(
    input: { groupId: string; fromAccountId: string; toAccountId: string },
  ): Promise<TransferReferences> {
    const rows = await this.sql<{ id: string; currency: string }[]>`
      SELECT id, currency FROM accounts
      WHERE id IN ${this.sql([input.fromAccountId, input.toAccountId])}
        AND group_id = ${input.groupId} AND deleted_at IS NULL
    `
    const currencyOf = (id: string) => {
      const row = rows.find((candidate) => candidate.id === id)
      return row ? { currency: row.currency } : null
    }
    return { from: currencyOf(input.fromAccountId), to: currencyOf(input.toAccountId) }
  }

  /**
   * Refuses a write that just added a live transfer to a household past its plan's `allowance`,
   * which counts entries and transfers together. It runs after the write, under the lock on the
   * household that every entry and transfer write takes. No cap needs no count.
   */
  private async assertRoom(
    groupId: string,
    allowance: number | null,
    role: GroupRole,
  ): Promise<void> {
    if (allowance === null) return
    assertRoomFor(
      "maxTransactions",
      allowance,
      (await countPlanTransactions(this.sql, groupId)) - 1,
      role,
    )
  }

  /** A transfer of the group, live or deleted. */
  private async find(groupId: string, id: string): Promise<Transfer | null> {
    const row = (
      await this.sql<TransferRow[]>`
        SELECT ${this.columns()} FROM transfers WHERE id = ${id} AND group_id = ${groupId}
      `
    )[0]
    return row ? toTransfer(row) : null
  }

  /**
   * Records the change of a transfer written in this transaction on its group, stores the sequence
   * on the transfer and returns the transfer as it now reads. A group deleted since the role check
   * is answered as a missing group, and the write rolls back with it.
   */
  private async stamp(
    transaction: postgres.TransactionSql,
    input: { groupId: string; id: string },
    actorId: number,
    eventKind: string,
  ): Promise<Transfer> {
    let sequence: string
    try {
      sequence = await recordGroupChange(transaction, input.groupId, actorId, eventKind)
    } catch (error) {
      if (error instanceof GroupNotActiveError) {
        throw new TransferError("GROUP_NOT_FOUND", "Group not found")
      }
      throw error
    }
    const row = (
      await this.sql<TransferRow[]>`
        UPDATE transfers SET change_sequence = ${sequence}::bigint
        WHERE id = ${input.id} AND group_id = ${input.groupId}
        RETURNING ${this.columns()}
      `
    )[0]
    if (!row) throw new Error(`Transfer ${input.id} vanished while its change was being recorded`)
    return toTransfer(row)
  }

  /** Explains why a write matched no row: the transfer is gone, or it is at another version. */
  private async refuseStaleWrite(groupId: string, id: string): Promise<never> {
    const current = (
      await this.sql<{ version: number }[]>`
        SELECT version FROM transfers
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    if (!current) throw new TransferError("TRANSFER_NOT_FOUND", "Transfer not found")
    throw new TransferVersionConflictError(current.version)
  }

  private columns() {
    return this.sql`
      transfers.id,
      transfers.group_id,
      transfers.from_account_id,
      transfers.sent_amount::text AS sent_amount,
      transfers.to_account_id,
      transfers.received_amount::text AS received_amount,
      transfers.converted,
      transfers.memo,
      to_char(transfers.date, 'YYYY-MM-DD') AS date,
      transfers.version,
      transfers.change_sequence::text AS change_sequence,
      transfers.created_by_user_id,
      transfers.updated_by_user_id,
      transfers.created_at,
      transfers.updated_at,
      transfers.deleted_at
    `
  }
}

/**
 * Whether a stored transfer is what a retried create asks for. A received amount left out of the
 * retry matches whatever the first try stored, since the server filled it then.
 */
function sameTransfer(existing: Transfer, input: TransferFields): boolean {
  return existing.fromAccountId === input.fromAccountId &&
    existing.toAccountId === input.toAccountId && existing.sentAmount === input.sentAmount &&
    existing.memo === input.memo && existing.date === input.date &&
    (input.receivedAmount === undefined || existing.receivedAmount === input.receivedAmount)
}

function toTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    groupId: row.groupId,
    fromAccountId: row.fromAccountId,
    sentAmount: amountOf(row.sentAmount),
    toAccountId: row.toAccountId,
    receivedAmount: amountOf(row.receivedAmount),
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
