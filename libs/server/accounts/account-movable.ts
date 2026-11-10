import type postgres from "postgres"
import { ACCOUNT_MAX_PER_GROUP, AccountError } from "@domain/accounts"
import { assertRoomFor } from "@domain/billing"
import type { MovableAggregate, MoveAllContext } from "@server/groups/movable.ts"

/**
 * Moves every live account of the source household into the target, in the move's transaction,
 * and returns how many moved. Each keeps its id, its creator and its history; its version grows by
 * one and it is stamped with the target's change. Deleted accounts stay behind and go with the
 * source household.
 *
 * The target keeps its own default: when it has one, the moved accounts arrive without the flag.
 * The target's caps, Financy's own (`ACCOUNT_MAX_PER_GROUP`) and its plan's `maxAccounts`, are
 * counted after the move, under the lock on the target that an `account.create` there waits for. A
 * move that would pass one is refused whole, with `ACCOUNT_LIMIT_REACHED` or the plan's
 * `PLAN_LIMIT_REACHED`, and the caller's transaction takes everything back.
 */
export async function moveAllAccountRows(
  transaction: postgres.TransactionSql,
  context: Pick<
    MoveAllContext,
    "fromGroupId" | "toGroupId" | "actorId" | "changeSequence" | "allowances" | "targetRole"
  >,
): Promise<number> {
  const { fromGroupId, toGroupId } = context
  const moved = await transaction`
    UPDATE accounts
    SET group_id = ${toGroupId},
        is_default = is_default AND NOT EXISTS (
          SELECT 1 FROM accounts target WHERE target.group_id = ${toGroupId} AND target.is_default
        ),
        version = version + 1,
        updated_by_user_id = ${context.actorId},
        updated_at = CURRENT_TIMESTAMP,
        change_sequence = ${context.changeSequence}::bigint
    WHERE group_id = ${fromGroupId} AND deleted_at IS NULL
    RETURNING id
  `
  if (moved.length > 0) {
    const [{ count }] = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count FROM accounts
      WHERE group_id = ${toGroupId} AND deleted_at IS NULL
    `
    if (count > ACCOUNT_MAX_PER_GROUP) {
      throw new AccountError(
        "ACCOUNT_LIMIT_REACHED",
        `The other household has no room for these accounts: it can hold ${ACCOUNT_MAX_PER_GROUP}`,
      )
    }
    // Every account in the target counts, so the room left is checked as if the last one moved
    // alone: `count - 1` must be below the cap.
    assertRoomFor(
      "maxAccounts",
      context.allowances.maxAccounts ?? null,
      count - 1,
      context.targetRole,
    )
  }
  return moved.length
}

/** Accounts in "move all of a group's data". See {@link moveAllAccountRows}. */
export const accountMovable: MovableAggregate = {
  kind: "accounts",
  moveAll: (transaction, context) => moveAllAccountRows(transaction, context),
}
