import type postgres from "postgres"
import type { MovableAggregate, MoveAllContext } from "@server/groups/movable.ts"
import { assertRoomForPlanTransactions } from "@server/transactions/plan-count.ts"

/**
 * Moves every transfer of the source household into the target, deleted ones included, in the
 * move's transaction, and returns how many moved. Each keeps its id, both amounts, its conversion
 * flag and its history; its version grows by one and it is stamped with the target's change.
 *
 * A transfer goes wherever its two accounts go. Every account a transfer names is live, since an
 * account any transfer names cannot be deleted, so the accounts' move takes both. A deleted
 * transfer moves too, as it would otherwise name accounts in the other household, and stays
 * restorable there for the rest of its days.
 *
 * Transfers and accounts move in separate statements, so this one defers the transfers' account
 * keys to the move's commit and must run before the accounts move. The target's plan cap,
 * `maxTransactions`, counts its live entries and live transfers together after the move
 * ({@link assertRoomForPlanTransactions}); a move that passes it is refused whole with
 * `PLAN_LIMIT_REACHED`.
 */
export async function moveAllTransferRows(
  transaction: postgres.TransactionSql,
  context: Pick<
    MoveAllContext,
    "fromGroupId" | "toGroupId" | "actorId" | "changeSequence" | "allowances" | "targetRole"
  >,
): Promise<number> {
  const { fromGroupId, toGroupId } = context
  await transaction`SET CONSTRAINTS transfers_from_account_fkey, transfers_to_account_fkey DEFERRED`
  const moved = await transaction<{ live: boolean }[]>`
    UPDATE transfers
    SET group_id = ${toGroupId},
        version = version + 1,
        updated_by_user_id = ${context.actorId},
        updated_at = CURRENT_TIMESTAMP,
        change_sequence = ${context.changeSequence}::bigint
    WHERE group_id = ${fromGroupId}
    RETURNING deleted_at IS NULL AS live
  `
  if (moved.some((row) => row.live)) await assertRoomForPlanTransactions(transaction, context)
  return moved.length
}

/** Transfers in "move all of a group's data". See {@link moveAllTransferRows}. */
export const transferMovable: MovableAggregate = {
  kind: "transfers",
  moveAll: (transaction, context) => moveAllTransferRows(transaction, context),
}
