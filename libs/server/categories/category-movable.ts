import type postgres from "postgres"
import {
  assertCategoryRoom,
  CATEGORY_MAX_PER_GROUP,
  CategoryError,
  categoryProblem,
} from "@domain/categories"
import type { CategoryNode } from "@domain/categories"
import { assertRoomFor } from "@domain/billing"
import type { MovableAggregate, MoveAllContext } from "@server/groups/movable.ts"

/**
 * Moves every category of the source household into the target, archived ones included, in the
 * move's transaction, and returns how many moved. Each keeps its id, its parent and its history;
 * its version grows by one and it is stamped with the target's change. Parents and children move
 * in one statement, so the foreign key on `(group_id, parent_id)` sees them arrive together.
 *
 * The target's rules are checked after the move, under the lock on the target that a
 * `category.create` there waits for: no two siblings may share a name (D3), and its caps, Financy's
 * own and its plan's `maxCategories`, count its live categories. A move that breaks one is refused
 * whole, and the caller's transaction takes everything back.
 */
export async function moveAllCategoryRows(
  transaction: postgres.TransactionSql,
  context: Pick<
    MoveAllContext,
    "fromGroupId" | "toGroupId" | "actorId" | "changeSequence" | "allowances" | "targetRole"
  >,
): Promise<number> {
  const { fromGroupId, toGroupId } = context
  const moved = await transaction<{ id: string }[]>`
    UPDATE categories
    SET group_id = ${toGroupId},
        version = version + 1,
        updated_by_user_id = ${context.actorId},
        updated_at = CURRENT_TIMESTAMP,
        change_sequence = ${context.changeSequence}::bigint
    WHERE group_id = ${fromGroupId}
    RETURNING id
  `
  if (moved.length === 0) return 0
  const household = await transaction<CategoryNode[]>`
    SELECT id, name, kind, parent_id, archived_at IS NOT NULL AS archived
    FROM categories WHERE group_id = ${toGroupId}
  `
  const movedIds = new Set(moved.map(({ id }) => id))
  if (
    household.some((category) =>
      movedIds.has(category.id) && categoryProblem(household, category) === "nameTaken"
    )
  ) {
    throw new CategoryError(
      "CATEGORY_NAME_TAKEN",
      "The other household already has a category with the name of one of these",
    )
  }
  const live = household.filter((category) => !category.archived).length
  if (live > CATEGORY_MAX_PER_GROUP) {
    throw new CategoryError(
      "CATEGORY_LIMIT_REACHED",
      `The other household has no room for these categories: it can hold ${CATEGORY_MAX_PER_GROUP}`,
    )
  }
  assertCategoryRoom(live, household.length)
  if (live > 0) {
    assertRoomFor(
      "maxCategories",
      context.allowances.maxCategories ?? null,
      live - 1,
      context.targetRole,
    )
  }
  return moved.length
}

/** Categories in "move all of a group's data". See {@link moveAllCategoryRows}. */
export const categoryMovable: MovableAggregate = {
  kind: "categories",
  moveAll: (transaction, context) => moveAllCategoryRows(transaction, context),
}
