import type postgres from "postgres"
import { assertRoomFor } from "@domain/billing"
import type { MovableAggregate, MoveAllContext } from "@server/groups/movable.ts"

/**
 * Moves every repeating rule of the source household into the target, deleted ones included, in
 * the move's transaction, and returns how many moved. Each keeps its id, its template, its repeat,
 * its skipped dates and its author; its version grows by one and it is stamped with the target's
 * change.
 *
 * A rule goes wherever its account and category go. Every account a rule names is live, since an
 * account with rules cannot be deleted, so the accounts' move takes it; the categories' move takes
 * all of them. A deleted rule moves too, as it would otherwise name an account in the other
 * household, and stays restorable there for the rest of its days. The author is a user, not a
 * member, so it moves unchanged, as an entry's does.
 *
 * Rules, accounts and categories move in separate statements, so this one defers the rules'
 * account and category keys to the move's commit (migration `2026_12_19_0001`) and must run before
 * the accounts and categories move. The target's plan cap, `maxRecurringRules`, counts its live
 * rules after the move, under the lock on the target that a rule write there waits for; a move
 * that passes it is refused whole with `PLAN_LIMIT_REACHED`.
 */
export async function moveAllRecurringRuleRows(
  transaction: postgres.TransactionSql,
  context: Pick<
    MoveAllContext,
    "fromGroupId" | "toGroupId" | "actorId" | "changeSequence" | "allowances" | "targetRole"
  >,
): Promise<number> {
  const { fromGroupId, toGroupId } = context
  await transaction`
    SET CONSTRAINTS recurring_rules_account_fkey, recurring_rules_category_fkey DEFERRED
  `
  const moved = await transaction<{ live: boolean }[]>`
    UPDATE recurring_rules
    SET group_id = ${toGroupId},
        version = version + 1,
        updated_by_user_id = ${context.actorId},
        updated_at = CURRENT_TIMESTAMP,
        change_sequence = ${context.changeSequence}::bigint
    WHERE group_id = ${fromGroupId}
    RETURNING deleted_at IS NULL AS live
  `
  const allowance = context.allowances.maxRecurringRules ?? null
  if (allowance !== null && moved.some((row) => row.live)) {
    const [{ count }] = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count FROM recurring_rules
      WHERE group_id = ${toGroupId} AND deleted_at IS NULL
    `
    // Every live rule in the target counts, so the room left is checked as if the last one moved
    // alone: `count - 1` must be below the cap.
    assertRoomFor("maxRecurringRules", allowance, count - 1, context.targetRole)
  }
  return moved.length
}

/** Repeating rules in "move all of a group's data". See {@link moveAllRecurringRuleRows}. */
export const recurringRuleMovable: MovableAggregate = {
  kind: "recurringRules",
  moveAll: (transaction, context) => moveAllRecurringRuleRows(transaction, context),
}
