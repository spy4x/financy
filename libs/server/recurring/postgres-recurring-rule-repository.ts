import type postgres from "postgres"
import {
  assertCanWriteRecurringRules,
  assertRuleReferences,
  RECURRING_RULE_EVENTS,
  type RecurringRule,
  type RecurringRuleCreateInput,
  type RecurringRuleDeleteInput,
  RecurringRuleError,
  type RecurringRuleFields,
  type RecurringRuleRepository,
  type RecurringRuleRestoreInput,
  type RecurringRuleSkipInput,
  type RecurringRuleUpdateInput,
  RecurringRuleVersionConflictError,
  type RecurringRuleWriteResult,
  skipDate,
} from "@domain/recurring"
import type { EntryReferences } from "@domain/transactions"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "@server/groups/group-change-log.ts"
import { recordTombstones } from "@server/groups/group-changes.ts"
import { amountOf } from "@server/accounts/postgres-account-repository.ts"
import type { GroupRole } from "@domain/groups"
import { assertRoomFor } from "@domain/billing"

/** A row as postgres.js reads it: the BIGINT columns come as decimal text, the dates as text. */
interface RecurringRuleRow extends postgres.Row, Omit<RecurringRule, `accountAmount` | `amount`> {
  accountAmount: string | null
  amount: string
}

/**
 * Checks, in the write's own transaction, that the actor may still change the rules, and returns
 * their role. The lock it takes on the group makes every other write of the household wait, so an
 * account or a category cannot change under the rule being written. A group deleted since is
 * answered as a missing group.
 */
async function assertWriterNow(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
): Promise<GroupRole> {
  try {
    const role = await lockActorRole(transaction, groupId, actorId)
    assertCanWriteRecurringRules(role)
    return role as GroupRole
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new RecurringRuleError(`GROUP_NOT_FOUND`, `Group not found`)
    }
    throw error
  }
}

/**
 * Repeating rules in Postgres. Every write runs in one transaction that checks the actor's role on
 * the locked group row (`lockActorRole`), reads the rule's account and category inside the
 * household under that lock and records the change on the group. Every statement names the group,
 * so an id from another household matches no row; the table's foreign keys on
 * `(group_id, account_id)` and `(group_id, category_id)` hold the same if a statement forgot it
 * (R17). No write here touches an entry.
 */
export class PostgresRecurringRuleRepository implements RecurringRuleRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async get(groupId: string, id: string): Promise<RecurringRule | null> {
    const row = (
      await this.sql<RecurringRuleRow[]>`
        SELECT ${this.columns()} FROM recurring_rules
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    return row ? toRule(row) : null
  }

  async list(groupId: string): Promise<RecurringRule[]> {
    const rows = await this.sql<RecurringRuleRow[]>`
      SELECT ${this.columns()} FROM recurring_rules
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ORDER BY created_at, id
    `
    return rows.map(toRule)
  }

  async count(groupId: string): Promise<number> {
    const [{ count }] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM recurring_rules
      WHERE group_id = ${groupId} AND deleted_at IS NULL
    `
    return count
  }

  async create(
    input: RecurringRuleCreateInput,
    actorId: number,
  ): Promise<RecurringRuleWriteResult> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresRecurringRuleRepository(transaction)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const existing = await repository.find(input.groupId, input.id)
      if (existing) {
        if (
          existing.deletedAt === null && existing.createdByUserId === actorId &&
          sameRule(existing, input)
        ) {
          return { rule: existing, created: false }
        }
        throw new RecurringRuleError(`ID_ALREADY_EXISTS`, `Repeating entry id is already in use`)
      }
      assertRuleReferences(input, await repository.references(input))
      // The id is the primary key: another household's rule under it inserts nothing.
      const inserted = (
        await transaction<{ id: string }[]>`
          INSERT INTO recurring_rules (
            id, group_id, account_id, category_id, kind, amount, account_amount, currency, memo,
            rrule, start_date, end_date, count, change_sequence, created_by_user_id,
            updated_by_user_id
          ) VALUES (
            ${input.id}, ${input.groupId}, ${input.accountId}, ${input.categoryId}, ${input.kind},
            ${input.amount}, ${input.accountAmount}, ${input.currency}, ${input.memo},
            ${input.rrule}, ${input.startDate}::date, ${input.endDate}::date, ${input.count}, 1,
            ${actorId}, ${actorId}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `
      )[0]
      if (!inserted) {
        throw new RecurringRuleError(`ID_ALREADY_EXISTS`, `Repeating entry id is already in use`)
      }
      await repository.assertRoom(input.groupId, input.allowance, role)
      const rule = await repository.stamp(input, actorId, RECURRING_RULE_EVENTS.created)
      return { rule, created: true }
    })
  }

  async update(input: RecurringRuleUpdateInput, actorId: number): Promise<RecurringRule> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresRecurringRuleRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      const current = await repository.lockLive(input.groupId, input.id)
      if (current.version !== input.expectedVersion) {
        throw new RecurringRuleVersionConflictError(current.version)
      }
      assertRuleReferences(input, await repository.references(input))
      await transaction`
        UPDATE recurring_rules
        SET account_id = ${input.accountId}, category_id = ${input.categoryId},
            kind = ${input.kind}, amount = ${input.amount},
            account_amount = ${input.accountAmount}, currency = ${input.currency},
            memo = ${input.memo}, rrule = ${input.rrule}, start_date = ${input.startDate}::date,
            end_date = ${input.endDate}::date, count = ${input.count},
            version = version + 1, updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId}
      `
      return await repository.stamp(input, actorId, RECURRING_RULE_EVENTS.updated)
    })
  }

  async delete(input: RecurringRuleDeleteInput, actorId: number): Promise<RecurringRule> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresRecurringRuleRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      const [row] = await transaction<{ id: string }[]>`
        UPDATE recurring_rules
        SET deleted_at = CURRENT_TIMESTAMP,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NULL
          AND version = ${input.expectedVersion}
        RETURNING id
      `
      if (!row) return await repository.refuseStaleWrite(input.groupId, input.id)
      const deleted = await repository.stamp(input, actorId, RECURRING_RULE_EVENTS.deleted)
      await recordTombstones(
        transaction,
        input.groupId,
        `recurring_rules`,
        [input.id],
        deleted.changeSequence,
      )
      return deleted
    })
  }

  async restore(input: RecurringRuleRestoreInput, actorId: number): Promise<RecurringRule> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresRecurringRuleRepository(transaction)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const [row] = await transaction<RecurringRuleRow[]>`
        UPDATE recurring_rules
        SET deleted_at = NULL,
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId} AND deleted_at IS NOT NULL
        RETURNING ${repository.columns()}
      `
      if (!row) throw notFound()
      // The account or the category may have changed while the rule sat in the trash.
      const rule = toRule(row)
      assertRuleReferences(rule, await repository.references(rule))
      await repository.assertRoom(input.groupId, input.allowance, role)
      return await repository.stamp(input, actorId, RECURRING_RULE_EVENTS.restored)
    })
  }

  async skip(input: RecurringRuleSkipInput, actorId: number): Promise<RecurringRule> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresRecurringRuleRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      const current = await repository.lockLive(input.groupId, input.id)
      const skipped = skipDate(current, input.date)
      if (skipped === null) return current
      await transaction`
        UPDATE recurring_rules
        SET skipped_dates = ${skipped}::date[],
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId}
      `
      return await repository.stamp(input, actorId, RECURRING_RULE_EVENTS.skipped)
    })
  }

  /** The live rule a write names, locked until the write commits; not found otherwise. */
  private async lockLive(groupId: string, id: string): Promise<RecurringRule> {
    const row = (
      await this.sql<RecurringRuleRow[]>`
        SELECT ${this.columns()} FROM recurring_rules
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
        FOR UPDATE
      `
    )[0]
    if (!row) throw notFound()
    return toRule(row)
  }

  /** The rule's account, live, and its category, archived ones included, inside the household. */
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
   * Refuses a write that just added a live rule to a household past its plan's `allowance`. It runs
   * after the write, under the lock on the household that every other rule write takes. No cap
   * needs no count.
   */
  private async assertRoom(
    groupId: string,
    allowance: number | null,
    role: GroupRole,
  ): Promise<void> {
    if (allowance === null) return
    assertRoomFor(`maxRecurringRules`, allowance, (await this.count(groupId)) - 1, role)
  }

  /** A rule of the group, live or deleted. */
  private async find(groupId: string, id: string): Promise<RecurringRule | null> {
    const row = (
      await this.sql<RecurringRuleRow[]>`
        SELECT ${this.columns()} FROM recurring_rules WHERE id = ${id} AND group_id = ${groupId}
      `
    )[0]
    return row ? toRule(row) : null
  }

  /**
   * Records the change of a rule written in this transaction on its group, stores the sequence on
   * the rule and returns the rule as it now reads. A group deleted since the role check is answered
   * as a missing group, and the write rolls back with it.
   */
  private async stamp(
    input: { groupId: string; id: string },
    actorId: number,
    eventKind: string,
  ): Promise<RecurringRule> {
    let sequence: string
    try {
      sequence = await recordGroupChange(
        this.sql as postgres.TransactionSql,
        input.groupId,
        actorId,
        eventKind,
      )
    } catch (error) {
      if (error instanceof GroupNotActiveError) {
        throw new RecurringRuleError(`GROUP_NOT_FOUND`, `Group not found`)
      }
      throw error
    }
    const row = (
      await this.sql<RecurringRuleRow[]>`
        UPDATE recurring_rules SET change_sequence = ${sequence}::bigint
        WHERE id = ${input.id} AND group_id = ${input.groupId}
        RETURNING ${this.columns()}
      `
    )[0]
    if (!row) {
      throw new Error(`Repeating rule ${input.id} vanished while its change was being recorded`)
    }
    return toRule(row)
  }

  /** Explains why a write matched no row: the rule is gone, or it is at another version. */
  private async refuseStaleWrite(groupId: string, id: string): Promise<never> {
    const current = (
      await this.sql<{ version: number }[]>`
        SELECT version FROM recurring_rules
        WHERE id = ${id} AND group_id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    if (!current) throw notFound()
    throw new RecurringRuleVersionConflictError(current.version)
  }

  private columns() {
    return this.sql`
      recurring_rules.id,
      recurring_rules.group_id,
      recurring_rules.account_id,
      recurring_rules.category_id,
      recurring_rules.kind,
      recurring_rules.amount::text AS amount,
      recurring_rules.account_amount::text AS account_amount,
      recurring_rules.currency,
      recurring_rules.memo,
      recurring_rules.rrule,
      to_char(recurring_rules.start_date, 'YYYY-MM-DD') AS start_date,
      to_char(recurring_rules.end_date, 'YYYY-MM-DD') AS end_date,
      recurring_rules.count,
      ARRAY(
        SELECT to_char(skipped, 'YYYY-MM-DD')
        FROM unnest(recurring_rules.skipped_dates) AS skipped
        ORDER BY skipped
      ) AS skipped_dates,
      to_char(recurring_rules.made_through, 'YYYY-MM-DD') AS made_through,
      recurring_rules.paused_reason,
      recurring_rules.version,
      recurring_rules.change_sequence::text AS change_sequence,
      recurring_rules.created_by_user_id,
      recurring_rules.updated_by_user_id,
      recurring_rules.created_at,
      recurring_rules.updated_at,
      recurring_rules.deleted_at
    `
  }
}

function notFound(): RecurringRuleError {
  return new RecurringRuleError(`RECURRING_RULE_NOT_FOUND`, `Repeating entry not found`)
}

/** Whether a stored rule is what a retried create asks for. */
function sameRule(existing: RecurringRule, input: RecurringRuleFields): boolean {
  return existing.accountId === input.accountId && existing.categoryId === input.categoryId &&
    existing.kind === input.kind && existing.amount === input.amount &&
    existing.accountAmount === input.accountAmount && existing.currency === input.currency &&
    existing.memo === input.memo && existing.rrule === input.rrule &&
    existing.startDate === input.startDate && existing.endDate === input.endDate &&
    existing.count === input.count
}

function toRule(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    groupId: row.groupId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    kind: row.kind,
    amount: amountOf(row.amount),
    accountAmount: row.accountAmount === null ? null : amountOf(row.accountAmount),
    currency: row.currency,
    memo: row.memo,
    rrule: row.rrule,
    startDate: row.startDate,
    endDate: row.endDate,
    count: row.count,
    skippedDates: row.skippedDates,
    madeThrough: row.madeThrough,
    pausedReason: row.pausedReason,
    version: row.version,
    changeSequence: row.changeSequence,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}
