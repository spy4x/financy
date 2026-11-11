import {
  assertCategoryRoom,
  assertNoCategoryProblem,
  type Category,
  type CategoryArchiveInput,
  categoryArchivePlan,
  type CategoryArchiveResult,
  type CategoryCreateInput,
  CategoryError,
  type CategoryNode,
  categoryProblem,
  type CategoryRepository,
  type CategoryUpdateInput,
  CategoryVersionConflictError,
  type CategoryWriteResult,
} from "@domain/categories"

const AT = new Date("2026-11-02T10:00:00.000Z")

/**
 * Categories in memory, with the Postgres repository's rules: an id is looked up inside its group,
 * the tree rules and sibling names are checked with the same functions, a household holds at most
 * `CATEGORY_MAX_PER_GROUP` live categories, a write at another version is refused with the current
 * one, and archiving a parent takes its children with it. The plan's cap is the entitlement gate's
 * in these tests.
 */
export class MemoryCategoryRepository implements CategoryRepository {
  readonly categories = new Map<string, Category>()
  writes = 0
  #sequence = 1

  list(groupId: string): Promise<Category[]> {
    return Promise.resolve(
      [...this.categories.values()]
        .filter((category) => category.groupId === groupId)
        .sort((a, b) => a.kind - b.kind || a.name.localeCompare(b.name)),
    )
  }

  get(groupId: string, id: string): Promise<Category | null> {
    const category = this.categories.get(id)
    return Promise.resolve(category && category.groupId === groupId ? category : null)
  }

  count(groupId: string): Promise<number> {
    return Promise.resolve(this.#nodes(groupId).filter((node) => !node.archived).length)
  }

  create(input: CategoryCreateInput, actorId: number): Promise<CategoryWriteResult> {
    const existing = this.categories.get(input.id)
    if (existing) {
      const same = existing.groupId === input.groupId && existing.name === input.name &&
        existing.kind === input.kind && existing.icon === input.icon &&
        existing.color === input.color && existing.parentId === input.parentId &&
        existing.createdByUserId === actorId
      if (same) return Promise.resolve({ category: existing, created: false })
      throw new CategoryError("ID_ALREADY_EXISTS", "taken")
    }
    const household = this.#nodes(input.groupId)
    assertNoCategoryProblem(categoryProblem(household, { ...input, archived: false }))
    const live = household.filter((node) => !node.archived).length
    assertCategoryRoom(live + 1, household.length + 1)
    const category: Category = {
      id: input.id,
      groupId: input.groupId,
      name: input.name,
      kind: input.kind,
      icon: input.icon,
      color: input.color,
      parentId: input.parentId,
      archivedAt: null,
      version: 1,
      changeSequence: String(this.#sequence++),
      createdByUserId: actorId,
      updatedByUserId: actorId,
      createdAt: AT,
      updatedAt: AT,
    }
    this.categories.set(category.id, category)
    this.writes++
    return Promise.resolve({ category, created: true })
  }

  update(input: CategoryUpdateInput, actorId: number): Promise<Category> {
    const current = this.#current(input)
    assertNoCategoryProblem(
      categoryProblem(this.#nodes(input.groupId), {
        ...input,
        archived: current.archivedAt !== null,
      }),
    )
    const category: Category = {
      ...current,
      name: input.name,
      kind: input.kind,
      icon: input.icon,
      color: input.color,
      parentId: input.parentId,
      version: current.version + 1,
      changeSequence: String(this.#sequence++),
      updatedByUserId: actorId,
    }
    this.categories.set(category.id, category)
    this.writes++
    return Promise.resolve(category)
  }

  archive(input: CategoryArchiveInput, actorId: number): Promise<CategoryArchiveResult> {
    this.#current(input)
    const household = this.#nodes(input.groupId)
    const plan = categoryArchivePlan(household, input.id, input.archived)
    if (plan.added > 0) {
      const live = household.filter((node) => !node.archived).length
      assertCategoryRoom(live + plan.added, household.length)
    }
    const sequence = String(this.#sequence++)
    const [category, ...children] = plan.ids.map((id) => {
      const before = this.categories.get(id)!
      const after: Category = {
        ...before,
        archivedAt: input.archived ? before.archivedAt ?? AT : null,
        version: before.version + 1,
        changeSequence: sequence,
        updatedByUserId: actorId,
      }
      this.categories.set(id, after)
      return after
    })
    this.writes++
    return Promise.resolve({ category, children })
  }

  #nodes(groupId: string): CategoryNode[] {
    return [...this.categories.values()]
      .filter((category) => category.groupId === groupId)
      .map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        parentId: category.parentId,
        archived: category.archivedAt !== null,
      }))
  }

  #current(input: { groupId: string; id: string; expectedVersion: number }): Category {
    const current = this.categories.get(input.id)
    if (!current || current.groupId !== input.groupId) {
      throw new CategoryError("CATEGORY_NOT_FOUND", "Category not found")
    }
    if (current.version !== input.expectedVersion) {
      throw new CategoryVersionConflictError(current.version)
    }
    return current
  }
}
