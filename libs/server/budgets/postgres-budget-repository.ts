import type postgres from "postgres"
import {
  assertBudgetCategory,
  assertCanSetBudgetMethod,
  assertCanWriteBudgets,
  type Budget,
  BUDGET_EVENTS,
  type BudgetAssignment,
  type BudgetCategory,
  BudgetError,
  type BudgetMethodSetInput,
  type BudgetMethodSetting,
  type BudgetMove,
  type BudgetMoveInput,
  type BudgetMoveTotal,
  type BudgetRepository,
  type BudgetSetInput,
  BudgetVersionConflictError,
} from "@domain/budgets"
import type { GroupRole } from "@domain/groups"
import { CategoryKind } from "@domain/categories"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "@server/groups/group-change-log.ts"
import { amountOf } from "@server/accounts/postgres-account-repository.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** A row as postgres.js reads it: the BIGINT amount comes as decimal text, or `null`. */
interface BudgetRow extends postgres.Row, Omit<Budget, "amount"> {
  amount: string | null
}

/** A move as postgres.js reads it: the BIGINT amount comes as decimal text. */
interface BudgetMoveRow extends postgres.Row, Omit<BudgetMove, "amount"> {
  amount: string
}

/**
 * Checks, in the write's own transaction, that the actor may still write budgets by `assert`. The
 * lock it takes on the group makes every other write of the household wait, so a category cannot
 * be archived or change its kind under the write. A group deleted since is answered as a missing
 * group.
 */
async function assertWriterNow(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
  assert: (role: GroupRole | null) => void = assertCanWriteBudgets,
): Promise<void> {
  try {
    assert(await lockActorRole(transaction, groupId, actorId))
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new BudgetError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Budgets in Postgres. A set runs in one transaction that checks the actor's role on the locked
 * group row (`lockActorRole`), reads the category inside the household under that lock, writes
 * the month's row at the version named and records the change on the group. Every statement names
 * the group, so an id from another household matches no row; the table's foreign key on
 * `(group_id, category_id)` holds the same if a statement forgot it (R17).
 */
export class PostgresBudgetRepository implements BudgetRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async set(input: BudgetSetInput, actorId: number): Promise<Budget> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresBudgetRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      const [category] = await transaction<{ kind: CategoryKind; archived: boolean }[]>`
        SELECT kind, archived_at IS NOT NULL AS archived FROM categories
        WHERE id = ${input.categoryId} AND group_id = ${input.groupId}
      `
      assertBudgetCategory(category ?? null, input.amount)
      const month = `${input.month}-01`
      const [current] = await transaction<{ id: string; version: number }[]>`
        SELECT id, version FROM budgets
        WHERE group_id = ${input.groupId} AND category_id = ${input.categoryId}
          AND month = ${month}::date
        FOR UPDATE
      `
      if ((current?.version ?? null) !== input.expectedVersion) {
        throw new BudgetVersionConflictError(current?.version ?? null)
      }
      const id = current?.id ?? uuidV7()
      if (current) {
        await transaction`
          UPDATE budgets
          SET amount = ${input.amount}, currency = ${input.currency}, version = version + 1,
              updated_by_user_id = ${actorId}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id} AND group_id = ${input.groupId}
        `
      } else {
        await transaction`
          INSERT INTO budgets (
            id, group_id, category_id, month, amount, currency, change_sequence,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            ${id}, ${input.groupId}, ${input.categoryId}, ${month}::date, ${input.amount},
            ${input.currency}, 1, ${actorId}, ${actorId}
          )
        `
      }
      return await repository.stamp(transaction, input.groupId, id, actorId)
    })
  }

  async setMethod(input: BudgetMethodSetInput, actorId: number): Promise<BudgetMethodSetting> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      await assertWriterNow(transaction, input.groupId, actorId, assertCanSetBudgetMethod)
      const month = `${input.month}-01`
      const [current] = await transaction<{ id: string; version: number }[]>`
        SELECT id, version FROM budget_methods
        WHERE group_id = ${input.groupId} AND month = ${month}::date
        FOR UPDATE
      `
      if ((current?.version ?? null) !== input.expectedVersion) {
        throw new BudgetVersionConflictError(current?.version ?? null)
      }
      const id = current?.id ?? uuidV7()
      const sequence = await recordChange(
        transaction,
        input.groupId,
        actorId,
        BUDGET_EVENTS.methodSet,
      )
      const [row] = current
        ? await transaction<BudgetMethodSetting[]>`
          UPDATE budget_methods
          SET method = ${input.method}, version = version + 1, change_sequence = ${sequence}::bigint,
              updated_by_user_id = ${actorId}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${id} AND group_id = ${input.groupId}
          RETURNING ${methodColumns(transaction)}
        `
        : await transaction<BudgetMethodSetting[]>`
          INSERT INTO budget_methods (
            id, group_id, month, method, change_sequence, created_by_user_id, updated_by_user_id
          ) VALUES (
            ${id}, ${input.groupId}, ${month}::date, ${input.method}, ${sequence}::bigint,
            ${actorId}, ${actorId}
          )
          RETURNING ${methodColumns(transaction)}
        `
      return row
    })
  }

  async move(input: BudgetMoveInput, actorId: number): Promise<BudgetMove> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      await assertWriterNow(transaction, input.groupId, actorId)
      const categories = await transaction<
        { id: string; kind: CategoryKind; archived: boolean }[]
      >`
        SELECT id, kind, archived_at IS NOT NULL AS archived FROM categories
        WHERE group_id = ${input.groupId}
          AND id IN (${input.fromCategoryId}, ${input.toCategoryId})
      `
      for (const id of [input.fromCategoryId, input.toCategoryId]) {
        assertBudgetCategory(
          categories.find((category) => category.id === id) ?? null,
          input.amount,
        )
      }
      const [inserted] = await transaction<{ id: string }[]>`
        INSERT INTO budget_moves (
          id, group_id, month, from_category_id, to_category_id, amount, currency,
          change_sequence, created_by_user_id
        ) VALUES (
          ${input.id}, ${input.groupId}, ${`${input.month}-01`}::date, ${input.fromCategoryId},
          ${input.toCategoryId}, ${input.amount}, ${input.currency}, 1, ${actorId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `
      if (!inserted) {
        // The id names a move already stored, maybe another household's: only this household's
        // move with the same fields is this request's, and a retry records no second change.
        const [stored] = await transaction<BudgetMoveRow[]>`
          SELECT ${moveColumns(transaction)} FROM budget_moves WHERE id = ${input.id}
        `
        const move = stored ? toMove(stored) : null
        if (
          move === null || move.groupId !== input.groupId || move.month !== input.month ||
          move.fromCategoryId !== input.fromCategoryId ||
          move.toCategoryId !== input.toCategoryId || move.amount !== input.amount
        ) {
          throw new BudgetError("ID_ALREADY_EXISTS", "This move id is taken by another move")
        }
        return move
      }
      const sequence = await recordChange(transaction, input.groupId, actorId, BUDGET_EVENTS.move)
      const [row] = await transaction<BudgetMoveRow[]>`
        UPDATE budget_moves SET change_sequence = ${sequence}::bigint
        WHERE id = ${input.id} AND group_id = ${input.groupId}
        RETURNING ${moveColumns(transaction)}
      `
      return toMove(row)
    })
  }

  async methodsUpTo(groupId: string, month: string): Promise<BudgetMethodSetting[]> {
    return await this.sql<BudgetMethodSetting[]>`
      SELECT ${methodColumns(this.sql)} FROM budget_methods
      WHERE group_id = ${groupId} AND month <= ${`${month}-01`}::date
      ORDER BY month
    `
  }

  async assignmentsIn(groupId: string, from: string, to: string): Promise<BudgetAssignment[]> {
    const rows = await this.sql<(Omit<BudgetAssignment, "amount"> & { amount: string })[]>`
      SELECT to_char(month, 'YYYY-MM') AS month, category_id, amount::text AS amount, currency
      FROM budgets
      WHERE group_id = ${groupId} AND amount IS NOT NULL
        AND month BETWEEN ${`${from}-01`}::date AND ${`${to}-01`}::date
    `
    return rows.map((row) => ({ ...row, amount: amountOf(row.amount) }))
  }

  async moveTotalsIn(groupId: string, from: string, to: string): Promise<BudgetMoveTotal[]> {
    const rows = await this.sql<
      (Omit<BudgetMoveTotal, "movedIn" | "movedOut"> & { movedIn: string; movedOut: string })[]
    >`
      SELECT
        to_char(sides.month, 'YYYY-MM') AS month,
        sides.category_id,
        sides.currency,
        sum(sides.moved_in)::text AS moved_in,
        sum(sides.moved_out)::text AS moved_out
      FROM (
        SELECT month, to_category_id AS category_id, currency, amount AS moved_in, 0 AS moved_out
        FROM budget_moves
        WHERE group_id = ${groupId}
          AND month BETWEEN ${`${from}-01`}::date AND ${`${to}-01`}::date
        UNION ALL
        SELECT month, from_category_id, currency, 0, amount
        FROM budget_moves
        WHERE group_id = ${groupId}
          AND month BETWEEN ${`${from}-01`}::date AND ${`${to}-01`}::date
      ) AS sides
      GROUP BY 1, 2, 3
    `
    // A sum past the safe range reads as an unsafe number, which the envelopes report as too large.
    return rows.map((row) => ({
      ...row,
      movedIn: Number(row.movedIn),
      movedOut: Number(row.movedOut),
    }))
  }

  async limitsAt(groupId: string, month: string): Promise<Budget[]> {
    const rows = await this.sql<BudgetRow[]>`
      SELECT DISTINCT ON (budgets.category_id) ${this.columns()} FROM budgets
      WHERE group_id = ${groupId} AND month <= ${`${month}-01`}::date
      ORDER BY budgets.category_id, budgets.month DESC
    `
    return rows.map(toBudget)
  }

  async categories(groupId: string): Promise<BudgetCategory[]> {
    return await this.sql<BudgetCategory[]>`
      SELECT id, parent_id FROM categories
      WHERE group_id = ${groupId} AND kind = ${CategoryKind.EXPENSE} AND archived_at IS NULL
      ORDER BY lower(name), id
    `
  }

  async timeZoneOf(groupId: string): Promise<string | null> {
    const row = (
      await this.sql<{ timeZone: string }[]>`
        SELECT time_zone FROM groups WHERE id = ${groupId} AND deleted_at IS NULL
      `
    )[0]
    return row?.timeZone ?? null
  }

  /**
   * Records the change of a row written in this transaction on its group, stores the sequence on
   * the row and returns it as it now reads.
   */
  private async stamp(
    transaction: postgres.TransactionSql,
    groupId: string,
    id: string,
    actorId: number,
  ): Promise<Budget> {
    const sequence = await recordChange(transaction, groupId, actorId, BUDGET_EVENTS.set)
    const [row] = await this.sql<BudgetRow[]>`
      UPDATE budgets SET change_sequence = ${sequence}::bigint
      WHERE id = ${id} AND group_id = ${groupId}
      RETURNING ${this.columns()}
    `
    if (!row) throw new Error(`Budget ${id} vanished while its change was being recorded`)
    return toBudget(row)
  }

  private columns() {
    return this.sql`
      budgets.id,
      budgets.group_id,
      budgets.category_id,
      to_char(budgets.month, 'YYYY-MM') AS month,
      budgets.amount::text AS amount,
      budgets.currency,
      budgets.version,
      budgets.change_sequence::text AS change_sequence,
      budgets.created_by_user_id,
      budgets.updated_by_user_id,
      budgets.created_at,
      budgets.updated_at
    `
  }
}

/** Moves the group's sequence for one budget write; a group deleted since is a missing group. */
async function recordChange(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
  kind: string,
): Promise<string> {
  try {
    return await recordGroupChange(transaction, groupId, actorId, kind)
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new BudgetError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

function methodColumns(sql: postgres.Sql) {
  return sql`
    budget_methods.id,
    budget_methods.group_id,
    to_char(budget_methods.month, 'YYYY-MM') AS month,
    budget_methods.method,
    budget_methods.version,
    budget_methods.change_sequence::text AS change_sequence,
    budget_methods.created_by_user_id,
    budget_methods.updated_by_user_id,
    budget_methods.created_at,
    budget_methods.updated_at
  `
}

function moveColumns(sql: postgres.Sql) {
  return sql`
    budget_moves.id,
    budget_moves.group_id,
    to_char(budget_moves.month, 'YYYY-MM') AS month,
    budget_moves.from_category_id,
    budget_moves.to_category_id,
    budget_moves.amount::text AS amount,
    budget_moves.currency,
    budget_moves.change_sequence::text AS change_sequence,
    budget_moves.created_by_user_id,
    budget_moves.created_at
  `
}

function toMove(row: BudgetMoveRow): BudgetMove {
  return {
    id: row.id,
    groupId: row.groupId,
    month: row.month,
    fromCategoryId: row.fromCategoryId,
    toCategoryId: row.toCategoryId,
    amount: amountOf(row.amount),
    currency: row.currency,
    changeSequence: row.changeSequence,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  }
}

function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    groupId: row.groupId,
    categoryId: row.categoryId,
    month: row.month,
    amount: row.amount === null ? null : amountOf(row.amount),
    currency: row.currency,
    version: row.version,
    changeSequence: row.changeSequence,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
