import type postgres from "postgres"
import type { MovableAggregate, MoveAllContext } from "@server/groups/movable.ts"

/**
 * Moves the source household's payee memory into the target in the move's transaction and returns
 * how many payees moved. Each keeps its id, its key and its category, which the categories' move
 * takes along. A payee the target already remembers keeps the target's choice: the source's row
 * for it is dropped, since the source is emptied and one household remembers a payee once.
 *
 * Payee memory and categories move in separate statements, so this one defers the category key to
 * the move's commit and must run before the categories move.
 */
export async function moveAllPayeeMemoryRows(
  transaction: postgres.TransactionSql,
  context: Pick<MoveAllContext, "fromGroupId" | "toGroupId">,
): Promise<number> {
  const { fromGroupId, toGroupId } = context
  await transaction`SET CONSTRAINTS payee_memory_category_fkey DEFERRED`
  await transaction`
    DELETE FROM payee_memory AS source
    USING payee_memory AS target
    WHERE source.group_id = ${fromGroupId} AND target.group_id = ${toGroupId}
      AND target.payee_key = source.payee_key
  `
  const moved = await transaction`
    UPDATE payee_memory SET group_id = ${toGroupId} WHERE group_id = ${fromGroupId}
  `
  return moved.count
}

/** Payee memory in "move all of a group's data". See {@link moveAllPayeeMemoryRows}. */
export const payeeMemoryMovable: MovableAggregate = {
  kind: "payeeMemory",
  moveAll: (transaction, context) => moveAllPayeeMemoryRows(transaction, context),
}
