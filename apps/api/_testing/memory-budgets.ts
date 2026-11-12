import { CategoryKind } from "@domain/categories"
import {
  assertBudgetCategory,
  type Budget,
  type BudgetAssignment,
  type BudgetCategory,
  BudgetError,
  type BudgetMethodSetInput,
  type BudgetMethodSetting,
  type BudgetMove,
  type BudgetMoveInput,
  type BudgetMoveTotal,
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
 * group and checked by the same {@link assertBudgetCategory}, one row per category and month, one
 * method row per month, a write at another version is refused with the current one, and a move's
 * id is taken once. The role check under the lock and the race with a removal need Postgres; the
 * integration tests hold them, and the handlers check the role before they reach this twin.
 */
export class MemoryBudgetRepository implements BudgetRepository {
  readonly budgets = new Map<string, Budget>()
  readonly methods = new Map<string, BudgetMethodSetting>()
  readonly moves = new Map<string, BudgetMove>()
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

  setMethod(input: BudgetMethodSetInput, actorId: number): Promise<BudgetMethodSetting> {
    const current = [...this.methods.values()].find((row) =>
      row.groupId === input.groupId && row.month === input.month
    )
    if ((current?.version ?? null) !== input.expectedVersion) {
      throw new BudgetVersionConflictError(current?.version ?? null)
    }
    const written: BudgetMethodSetting = {
      id: current?.id ?? uuidV7(),
      groupId: input.groupId,
      month: input.month,
      method: input.method,
      version: (current?.version ?? 0) + 1,
      changeSequence: String(this.#sequence++),
      createdByUserId: current?.createdByUserId ?? actorId,
      updatedByUserId: actorId,
      createdAt: current?.createdAt ?? AT,
      updatedAt: AT,
    }
    this.methods.set(written.id, written)
    this.writes++
    return Promise.resolve(written)
  }

  move(input: BudgetMoveInput, actorId: number): Promise<BudgetMove> {
    for (const id of [input.fromCategoryId, input.toCategoryId]) {
      const category = this.categoryMap.get(id)
      assertBudgetCategory(
        category && category.groupId === input.groupId
          ? { kind: category.kind, archived: category.archived ?? false }
          : null,
        input.amount,
      )
    }
    const stored = this.moves.get(input.id)
    if (stored) {
      if (
        stored.groupId !== input.groupId || stored.month !== input.month ||
        stored.fromCategoryId !== input.fromCategoryId ||
        stored.toCategoryId !== input.toCategoryId || stored.amount !== input.amount
      ) {
        throw new BudgetError("ID_ALREADY_EXISTS", "This move id is taken by another move")
      }
      return Promise.resolve(stored)
    }
    const move: BudgetMove = {
      id: input.id,
      groupId: input.groupId,
      month: input.month,
      fromCategoryId: input.fromCategoryId,
      toCategoryId: input.toCategoryId,
      amount: input.amount,
      currency: input.currency,
      changeSequence: String(this.#sequence++),
      createdByUserId: actorId,
      createdAt: AT,
    }
    this.moves.set(move.id, move)
    this.writes++
    return Promise.resolve(move)
  }

  methodsUpTo(groupId: string, month: string): Promise<BudgetMethodSetting[]> {
    return Promise.resolve(
      [...this.methods.values()]
        .filter((row) => row.groupId === groupId && row.month <= month)
        .sort((a, b) => a.month < b.month ? -1 : 1),
    )
  }

  assignmentsIn(groupId: string, from: string, to: string): Promise<BudgetAssignment[]> {
    return Promise.resolve(
      [...this.budgets.values()].flatMap((row) =>
        row.groupId === groupId && row.month >= from && row.month <= to && row.amount !== null &&
          row.currency !== null
          ? [{
            month: row.month,
            categoryId: row.categoryId,
            amount: row.amount,
            currency: row.currency,
          }]
          : []
      ),
    )
  }

  moveTotalsIn(groupId: string, from: string, to: string): Promise<BudgetMoveTotal[]> {
    const totals = new Map<string, BudgetMoveTotal>()
    const add = (move: BudgetMove, categoryId: string, side: "movedIn" | "movedOut") => {
      const key = `${move.month}:${categoryId}:${move.currency}`
      const total = totals.get(key) ??
        { month: move.month, categoryId, currency: move.currency, movedIn: 0, movedOut: 0 }
      total[side] += move.amount
      totals.set(key, total)
    }
    for (const move of this.moves.values()) {
      if (move.groupId !== groupId || move.month < from || move.month > to) continue
      add(move, move.toCategoryId, "movedIn")
      add(move, move.fromCategoryId, "movedOut")
    }
    return Promise.resolve([...totals.values()])
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
