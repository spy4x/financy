import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  assertCanReadCategories,
  assertCanWriteCategories,
  CategoryArchiveCommand,
  CategoryCreateCommand,
  CategoryError,
  CategoryGetQuery,
  CategoryListQuery,
  type CategoryRepository,
  CategoryUpdateCommand,
} from "@domain/categories"
import type { GroupRoleLookup } from "@domain/notes"

/** What every category handler needs: the categories, and the actor's role in the household. */
export interface CategoryHandlerDependencies {
  categories: CategoryRepository
  groups: GroupRoleLookup
}

/**
 * Throws unless the entitlement gate set the plan's cap on the command: a bus without the gate
 * would add categories to a household that has no plan, so it fails closed.
 */
function assertGated(
  allowance: number | null | undefined,
  command: string,
): asserts allowance is number | null {
  if (allowance === undefined) {
    throw new Error(`${command} reached its handler without the entitlement gate`)
  }
}

/**
 * The category handlers. Each one decides who may act before it touches a category: every member
 * reads, an editor or above writes, and a stranger is told the household does not exist. The
 * repository checks the role again inside each write's transaction, so a write that races a
 * removal or a demotion is refused too. Session strength is checked earlier, by the session gate.
 */
export function createCategoryCreateHandler(
  { categories, groups }: CategoryHandlerDependencies,
): CommandHandler<CategoryCreateCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "CategoryCreateCommand")
    assertCanWriteCategories(await groups.roleOf(data.groupId, data.actor.userId))
    return await categories.create(
      {
        allowance,
        groupId: data.groupId,
        id: data.id,
        name: data.name,
        kind: data.kind,
        icon: data.icon,
        color: data.color,
        parentId: data.parentId,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
  }
}

export function createCategoryUpdateHandler(
  { categories, groups }: CategoryHandlerDependencies,
): CommandHandler<CategoryUpdateCommand> {
  return async ({ data }) => {
    assertCanWriteCategories(await groups.roleOf(data.groupId, data.actor.userId))
    const category = await categories.update(
      {
        groupId: data.groupId,
        id: data.id,
        name: data.name,
        kind: data.kind,
        icon: data.icon,
        color: data.color,
        parentId: data.parentId,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { category }
  }
}

/** Archives a category with its children, or brings them back; an unarchive is capped (D1). */
export function createCategoryArchiveHandler(
  { categories, groups }: CategoryHandlerDependencies,
): CommandHandler<CategoryArchiveCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "CategoryArchiveCommand")
    assertCanWriteCategories(await groups.roleOf(data.groupId, data.actor.userId))
    return await categories.archive(
      {
        allowance,
        groupId: data.groupId,
        id: data.id,
        archived: data.archived,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
  }
}

export function createCategoryListHandler(
  { categories, groups }: CategoryHandlerDependencies,
): QueryHandler<CategoryListQuery> {
  return async ({ data }) => {
    assertCanReadCategories(await groups.roleOf(data.groupId, data.actor.userId))
    return { categories: await categories.list(data.groupId) }
  }
}

export function createCategoryGetHandler(
  { categories, groups }: CategoryHandlerDependencies,
): QueryHandler<CategoryGetQuery> {
  return async ({ data }) => {
    assertCanReadCategories(await groups.roleOf(data.groupId, data.actor.userId))
    const category = await categories.get(data.groupId, data.id)
    if (!category) throw new CategoryError("CATEGORY_NOT_FOUND", "Category not found")
    return { category }
  }
}
