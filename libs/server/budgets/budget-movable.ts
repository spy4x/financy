import type postgres from "postgres"
import type { MovableAggregate, MoveAllContext } from "@server/groups/movable.ts"

/** What a budget move needs of the mover's context. */
type BudgetMoveContext = Pick<
  MoveAllContext,
  "fromGroupId" | "toGroupId" | "actorId" | "changeSequence"
>

/**
 * Moves every budget row of the source household into the target, in the move's transaction, and
 * returns how many moved. Each keeps its id, its category, its month, its amount and currency, and
 * its author; its version grows by one and it is stamped with the target's change.
 *
 * A row goes wherever its category goes, and the categories' move takes all of them with their ids,
 * so a row never meets a target row of the same category and month
 * (`budgets_group_category_month_key`). Rows and categories move in separate statements, so this
 * one defers the rows' category key to the move's commit (migration `2026_12_22_0001`) and must
 * run before the categories move.
 *
 * No plan cap counts budget rows, and the plan's `budgets` feature gates only setting an amount:
 * the rows move into a target on any plan, as its books never block a household.
 */
export async function moveAllBudgetRows(
  transaction: postgres.TransactionSql,
  context: BudgetMoveContext,
): Promise<number> {
  await transaction`SET CONSTRAINTS budgets_category_fkey DEFERRED`
  const moved = await transaction`
    UPDATE budgets
    SET group_id = ${context.toGroupId},
        version = version + 1,
        updated_by_user_id = ${context.actorId},
        updated_at = CURRENT_TIMESTAMP,
        change_sequence = ${context.changeSequence}::bigint
    WHERE group_id = ${context.fromGroupId}
  `
  return moved.count
}

/**
 * Moves every envelope move of the source household into the target, in the move's transaction,
 * and returns how many moved. A move is never edited, so it has no version and no editor: it keeps
 * its id, both categories, its amount, its currency and its author, and is stamped with the
 * target's change. Like the budget rows, it defers its two category keys and runs before the
 * categories move.
 *
 * The household's budgeting method rows (`budget_methods`) stay where they are. The method is a
 * setting of the household, as its main currency and time zone are, which "move all" leaves with
 * the source too; and both households may hold a row for the same month, which the target's
 * `budget_methods_group_month_key` would refuse.
 */
export async function moveAllBudgetMoveRows(
  transaction: postgres.TransactionSql,
  context: BudgetMoveContext,
): Promise<number> {
  await transaction`
    SET CONSTRAINTS budget_moves_from_category_fkey, budget_moves_to_category_fkey DEFERRED
  `
  const moved = await transaction`
    UPDATE budget_moves
    SET group_id = ${context.toGroupId},
        change_sequence = ${context.changeSequence}::bigint
    WHERE group_id = ${context.fromGroupId}
  `
  return moved.count
}

/** Budget rows in "move all of a group's data". See {@link moveAllBudgetRows}. */
export const budgetMovable: MovableAggregate = {
  kind: "budgets",
  moveAll: (transaction, context) => moveAllBudgetRows(transaction, context),
}

/** Envelope moves in "move all of a group's data". See {@link moveAllBudgetMoveRows}. */
export const budgetMoveMovable: MovableAggregate = {
  kind: "budgetMoves",
  moveAll: (transaction, context) => moveAllBudgetMoveRows(transaction, context),
}
