import type postgres from "postgres"
import { assertRoomFor } from "@domain/billing"
import type { MovableAggregate, MoveAllContext } from "@server/groups/movable.ts"

/**
 * Moves every entry of the source household into the target, deleted ones included, in the move's
 * transaction, and returns how many moved. Each keeps its id, its amounts, its currency, its
 * conversion flag and its history; its version grows by one and it is stamped with the target's
 * change.
 *
 * An entry goes wherever its account and category go. Every account an entry names is live, since
 * an account with entries cannot be deleted, so the accounts' move takes it; the categories' move
 * takes all of them. A deleted entry moves too, as it would otherwise name an account in the other
 * household, and stays restorable there for the rest of its days.
 *
 * Entries, accounts and categories move in separate statements, so this one defers the entries'
 * account and category keys to the move's commit (migration `2026_12_16_0009`) and must run before
 * the accounts and categories move. The target's plan cap, `maxTransactions`, counts its live
 * entries after the move, under the lock on the target that an entry write there waits for; a
 * move that passes it is refused whole with `PLAN_LIMIT_REACHED`.
 */
export async function moveAllTransactionRows(
  transaction: postgres.TransactionSql,
  context: Pick<
    MoveAllContext,
    "fromGroupId" | "toGroupId" | "actorId" | "changeSequence" | "allowances" | "targetRole"
  >,
): Promise<number> {
  const { fromGroupId, toGroupId } = context
  await transaction`SET CONSTRAINTS transactions_account_fkey, transactions_category_fkey DEFERRED`
  const moved = await transaction<{ live: boolean }[]>`
    UPDATE transactions
    SET group_id = ${toGroupId},
        version = version + 1,
        updated_by_user_id = ${context.actorId},
        updated_at = CURRENT_TIMESTAMP,
        change_sequence = ${context.changeSequence}::bigint
    WHERE group_id = ${fromGroupId}
    RETURNING deleted_at IS NULL AS live
  `
  const allowance = context.allowances.maxTransactions ?? null
  if (allowance !== null && moved.some((row) => row.live)) {
    const [{ count }] = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count FROM transactions
      WHERE group_id = ${toGroupId} AND deleted_at IS NULL
    `
    // Every live entry in the target counts, so the room left is checked as if the last one moved
    // alone: `count - 1` must be below the cap.
    assertRoomFor("maxTransactions", allowance, count - 1, context.targetRole)
  }
  return moved.length
}

/** Entries in "move all of a group's data". See {@link moveAllTransactionRows}. */
export const transactionMovable: MovableAggregate = {
  kind: "transactions",
  moveAll: (transaction, context) => moveAllTransactionRows(transaction, context),
}
