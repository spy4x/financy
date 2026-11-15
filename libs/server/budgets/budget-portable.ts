import type postgres from "postgres"
import type { CategoryKind } from "@domain/categories"
import {
  type BudgetExportEntry,
  budgetExportProblems,
  type BudgetFileProblem,
  type BudgetMethodExportEntry,
  budgetMethodExportProblems,
  type BudgetMoveExportEntry,
  budgetMoveReferenceProblems,
  budgetReferenceProblems,
  parseBudgetExportEntry,
  parseBudgetMethodExportEntry,
  parseBudgetMoveExportEntry,
  rowsInExpenseCategories,
} from "@domain/budgets"
import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError } from "@domain/groups"
import { portable, type PortableContext } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Rows one statement writes: well under Postgres's 65,535 parameters at eleven columns a row. */
const WRITE_BATCH = 1_000

/**
 * The new household's category of a file id, for the reference checks: the category the
 * registry wrote before the budgets, read back by its new id.
 */
async function categoriesOf(
  sql: postgres.TransactionSql,
  context: PortableContext,
): Promise<(fileId: string) => { kind: CategoryKind } | null> {
  const rows = await sql<{ id: string; kind: CategoryKind }[]>`
    SELECT id, kind FROM categories WHERE group_id = ${context.groupId}
  `
  const byId = new Map(rows.map((row) => [row.id, row]))
  return (fileId) => byId.get(context.newIdOf(`categories`, fileId) ?? ``) ?? null
}

/** Refuses the whole import with each problem, at most `GROUP_IMPORT_PROBLEMS_MAX` of them. */
function refuse(part: string, noun: string, problems: readonly BudgetFileProblem[]): void {
  if (problems.length === 0) return
  throw new GroupImportError(
    problems.slice(0, GROUP_IMPORT_PROBLEMS_MAX).map(({ index, problem, issue }) => ({
      kind: `invalid`,
      where: `${noun} ${index + 1}`,
      problem,
      place: { part, index: index + 1 },
      issue,
    })),
    problems.length,
  )
}

/** Inserts `rows` into `table`, {@link WRITE_BATCH} at a time. */
async function insertAll(
  sql: postgres.TransactionSql,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  for (let start = 0; start < rows.length; start += WRITE_BATCH) {
    await sql`INSERT INTO ${sql(table)} ${sql(rows.slice(start, start + WRITE_BATCH))}`
  }
}

/**
 * Budget rows in a household's export file: each category's limit from a month on, removed
 * limits included, in the currency it was set in. On import each row gets a new id and names the
 * new id of its category, which the registry writes before it. A row whose category the file
 * lacks, or a second row for one category and month, refuses the whole import; a row whose
 * category is now an income category is skipped, as the reads ignore it. No plan cap counts them, and the plan's `budgets` feature gates only setting an amount,
 * so they import on any plan.
 */
export const budgetPortable = portable<BudgetExportEntry>({
  kind: `budgets`,
  one: `budget`,
  other: `budgets`,
  parse: parseBudgetExportEntry,
  check: budgetExportProblems,
  async *read(sql, groupId) {
    const rows = await sql<(Omit<BudgetExportEntry, `amount`> & { amount: string | null })[]>`
      SELECT id, category_id, to_char(month, 'YYYY-MM') AS month, amount::text AS amount,
        currency, created_at, updated_at
      FROM budgets WHERE group_id = ${groupId}
      ORDER BY category_id, month
    `
    yield rows.map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }))
  },
  async write(sql, budgets, context) {
    const ids = new Map<string, string>()
    if (budgets.length === 0) return ids
    const category = await categoriesOf(sql, context)
    refuse(`budgets`, `Budget`, budgetReferenceProblems(budgets, category))
    const kept = rowsInExpenseCategories(budgets, (budget) => [budget.categoryId], category)
    const rows = kept.map((budget) => {
      const id = uuidV7()
      ids.set(budget.id, id)
      return {
        id,
        group_id: context.groupId,
        category_id: context.newIdOf(`categories`, budget.categoryId)!,
        month: `${budget.month}-01`,
        amount: budget.amount,
        currency: budget.currency,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        created_at: budget.createdAt,
        updated_at: budget.updatedAt,
      }
    })
    await insertAll(sql, `budgets`, rows)
    return ids
  },
})

/**
 * The household's budgeting method rows in its export file: the method from each month on. A new
 * household holds none, so they import as they were, under new ids. A second row for one month
 * refuses the whole import.
 */
export const budgetMethodPortable = portable<BudgetMethodExportEntry>({
  kind: `budgetMethods`,
  one: `budget method`,
  other: `budget methods`,
  parse: parseBudgetMethodExportEntry,
  check: budgetMethodExportProblems,
  async *read(sql, groupId) {
    yield await sql<BudgetMethodExportEntry[]>`
      SELECT id, to_char(month, 'YYYY-MM') AS month, method, created_at, updated_at
      FROM budget_methods WHERE group_id = ${groupId}
      ORDER BY month
    `
  },
  async write(sql, methods, context) {
    const ids = new Map<string, string>()
    const rows = methods.map((method) => {
      const id = uuidV7()
      ids.set(method.id, id)
      return {
        id,
        group_id: context.groupId,
        month: `${method.month}-01`,
        method: method.method,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        created_at: method.createdAt,
        updated_at: method.updatedAt,
      }
    })
    await insertAll(sql, `budget_methods`, rows)
    return ids
  },
})

/**
 * Envelope moves in a household's export file: money moved between two categories in a month, in
 * the currency it was made in. On import each gets a new id and names the new ids of its two
 * categories; one whose category the file lacks refuses the whole import, and one naming a
 * category that is now an income category is skipped, as the move command refuses those.
 */
export const budgetMovePortable = portable<BudgetMoveExportEntry>({
  kind: `budgetMoves`,
  one: `budget move`,
  other: `budget moves`,
  parse: parseBudgetMoveExportEntry,
  async *read(sql, groupId) {
    const rows = await sql<(Omit<BudgetMoveExportEntry, `amount`> & { amount: string })[]>`
      SELECT id, to_char(month, 'YYYY-MM') AS month, from_category_id, to_category_id,
        amount::text AS amount, currency, created_at
      FROM budget_moves WHERE group_id = ${groupId}
      ORDER BY month, id
    `
    yield rows.map((row) => ({ ...row, amount: Number(row.amount) }))
  },
  async write(sql, moves, context) {
    const ids = new Map<string, string>()
    if (moves.length === 0) return ids
    const category = await categoriesOf(sql, context)
    refuse(`budgetMoves`, `Budget move`, budgetMoveReferenceProblems(moves, category))
    const newCategory = (fileId: string) => context.newIdOf(`categories`, fileId)!
    const kept = rowsInExpenseCategories(
      moves,
      (move) => [move.fromCategoryId, move.toCategoryId],
      category,
    )
    const rows = kept.map((move) => {
      const id = uuidV7()
      ids.set(move.id, id)
      return {
        id,
        group_id: context.groupId,
        month: `${move.month}-01`,
        from_category_id: newCategory(move.fromCategoryId),
        to_category_id: newCategory(move.toCategoryId),
        amount: move.amount,
        currency: move.currency,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        created_at: move.createdAt,
      }
    })
    await insertAll(sql, `budget_moves`, rows)
    return ids
  },
})

/** The budget parts of the export file, in the order an import writes them, after the categories. */
export const budgetPortables = [budgetPortable, budgetMethodPortable, budgetMovePortable] as const
