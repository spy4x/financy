import type postgres from "postgres"
import { assertRoomFor } from "@domain/billing"
import type { MoveAllContext } from "@server/groups/movable.ts"

/**
 * What the plan's `maxTransactions` counts in a household: its live entries and its live transfers
 * together (`docs/billing-plans.md`). The entitlement gate reads it before a write, and each write
 * of either kind counts again under the household's lock, so neither kind can slip past the other.
 */
export async function countPlanTransactions(sql: postgres.Sql, groupId: string): Promise<number> {
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT (
      (SELECT count(*) FROM transactions WHERE group_id = ${groupId} AND deleted_at IS NULL) +
      (SELECT count(*) FROM transfers WHERE group_id = ${groupId} AND deleted_at IS NULL)
    )::int AS count
  `
  return count
}

/**
 * Refuses a move of all of a household's data that left the target past its plan's
 * `maxTransactions`, counting the target's live entries and live transfers together, under the lock
 * on the target that every entry and transfer write there waits for. Entries and transfers move in
 * turn and each calls this after its own move, so the last one counts both. Every live row in the
 * target counts, so the room left is checked as if the last one moved alone: `count - 1` must be
 * below the cap. No cap needs no count.
 */
export async function assertRoomForPlanTransactions(
  transaction: postgres.TransactionSql,
  context: Pick<MoveAllContext, "toGroupId" | "allowances" | "targetRole">,
): Promise<void> {
  const allowance = context.allowances.maxTransactions ?? null
  if (allowance === null) return
  const count = await countPlanTransactions(transaction, context.toGroupId)
  assertRoomFor("maxTransactions", allowance, count - 1, context.targetRole)
}
