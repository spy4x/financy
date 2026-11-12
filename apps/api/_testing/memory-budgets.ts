import { CategoryKind } from "@domain/categories"
import {
  assertBudgetCategory,
  type Budget,
  type BudgetCategory,
  type BudgetRepository,
  type BudgetSetInput,
  BudgetVersionConflictError,
} from "@domain/budgets"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

const AT = new Date("2026-11-02T10:00:00.000Z")

/** A household's category as the twin knows it, in the order the month lists them. */
export interface MemoryBudgetCategory {
  groupId: string
  kind: CategoryKind
  parentId?: string | null
  archived?: boolean
}

/**
 * Budgets in memory, with the Postgres repository's rules: a category is looked up inside its
 * group and checked by the same {@link assertBudgetCategory}, one row per category and month, and
 * a set at another version is refused with the current one. The role check under the lock and the
 * race with a removal need Postgres; the integration tests hold them.
 */
export class MemoryBudgetRepository implements BudgetRepository {
  readonly budgets = new Map<string, Budget>()
  writes = 0
  #sequence = 1

  constructor(
    readonly categoryMap: Map<string, MemoryBudgetCategory>,
    /** Each household's time zone; one missing is UTC. */
    readonly timeZones: Map<string, string> = new Map(),
  ) {}

  set(input: BudgetSetInput, actorId: number): Promise<Budget> {
    const category = this.categoryMap.get(input.categoryId)
    assertBudgetCategory(
      category && category.groupId === input.groupId
        ? { kind: category.kind, archived: category.archived ?? false }
        : null,
      input.amount,
    )
    const current = [...this.budgets.values()].find((row) =>
      row.groupId === input.groupId && row.categoryId === input.categoryId &&
      row.month === input.month
    )
    if ((current?.version ?? null) !== input.expectedVersion) {
      throw new BudgetVersionConflictError(current?.version ?? null)
    }
    const written: Budget = {
      id: current?.id ?? uuidV7(),
      groupId: input.groupId,
      categoryId: input.categoryId,
      month: input.month,
      amount: input.amount,
      currency: input.currency,
      version: (current?.version ?? 0) + 1,
      changeSequence: String(this.#sequence++),
      createdByUserId: current?.createdByUserId ?? actorId,
      updatedByUserId: actorId,
      createdAt: current?.createdAt ?? AT,
      updatedAt: AT,
    }
    this.budgets.set(written.id, written)
    this.writes++
    return Promise.resolve(written)
  }

  limitsAt(groupId: string, month: string): Promise<Budget[]> {
    const latest = new Map<string, Budget>()
    for (const row of this.budgets.values()) {
      if (row.groupId !== groupId || row.month > month) continue
      const seen = latest.get(row.categoryId)
      if (!seen || seen.month < row.month) latest.set(row.categoryId, row)
    }
    return Promise.resolve([...latest.values()])
  }

  categories(groupId: string): Promise<BudgetCategory[]> {
    return Promise.resolve(
      [...this.categoryMap]
        .filter(([, category]) =>
          category.groupId === groupId && category.kind === CategoryKind.EXPENSE &&
          !category.archived
        )
        .map(([id, category]) => ({ id, parentId: category.parentId ?? null })),
    )
  }

  timeZoneOf(groupId: string): Promise<string | null> {
    return Promise.resolve(this.timeZones.get(groupId) ?? "UTC")
  }
}
