import type postgres from "postgres"
import {
  assertBudgetCategory,
  assertCanWriteBudgets,
  type Budget,
  BUDGET_EVENTS,
  type BudgetCategory,
  BudgetError,
  type BudgetRepository,
  type BudgetSetInput,
  BudgetVersionConflictError,
} from "@domain/budgets"
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

/**
 * Checks, in the write's own transaction, that the actor may still set budgets. The lock it takes
 * on the group makes every other write of the household wait, so the category cannot be archived
 * or change its kind under the set. A group deleted since is answered as a missing group.
 */
async function assertWriterNow(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
): Promise<void> {
  try {
    assertCanWriteBudgets(await lockActorRole(transaction, groupId, actorId))
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
    let sequence: string
    try {
      sequence = await recordGroupChange(transaction, groupId, actorId, BUDGET_EVENTS.set)
    } catch (error) {
      if (error instanceof GroupNotActiveError) {
        throw new BudgetError("GROUP_NOT_FOUND", "Group not found")
      }
      throw error
    }
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
