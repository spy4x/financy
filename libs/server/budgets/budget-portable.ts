import type postgres from "postgres"
import type { CategoryKind } from "@domain/categories"
import {
  type BudgetExportEntry,
  budgetExportProblems,
  type BudgetFileProblem,
  type BudgetMethodExportEntry,
  budgetMethodExportProblems,
  budgetMonth,
  type BudgetMoveExportEntry,
  budgetMoveReferenceProblems,
  budgetReferenceProblems,
  parseBudgetExportEntry,
  parseBudgetMethodExportEntry,
  parseBudgetMoveExportEntry,
  rowsInExpenseCategories,
} from "@domain/budgets"
import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError, groupTimeZone } from "@domain/groups"
import type { EntryRateLookup, Ledger } from "@domain/transactions"
import { portable, type PortableContext } from "@server/groups/portable.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { amountCell } from "@server/money/spreadsheet-amount.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import type { CsvDecimal } from "@spy4x/platform/universal/csv"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { endOfMonth, shiftMonth } from "@spy4x/time/date"
import { currentPeriod, periodOf, PeriodUnit } from "@spy4x/time/period"
import { isoDateInTz } from "@spy4x/time/tz"
import { PostgresBudgetRepository } from "./postgres-budget-repository.ts"

/** Rows one statement writes: well under Postgres's 65,535 parameters at eleven columns a row. */
const WRITE_BATCH = 1_000

/**
 * The most months `budgets.csv` covers, counted back from the household's current month: twenty
 * years. An imported file may start a limit in the year 0001, which would otherwise be about
 * 24,000 months of rows for every category.
 */
export const BUDGET_SPREADSHEET_MONTHS_MAX = 240

/** A row of `budgets.csv`: one category's limit and spending in one month. */
export interface BudgetSpreadsheetRow {
  month: string
  category: string
  limit: CsvDecimal | string
  currency: string
  spent: CsvDecimal | string
  leftOut: string
}

/**
 * The rows of `budgets.csv`, a page per month: each category with a limit that month, from the
 * group's earliest limit through the household's current month in its time zone, at most
 * {@link BUDGET_SPREADSHEET_MONTHS_MAX} months. Each month is fed to `budgetMonth` as the Budgets
 * screen feeds it, so a row shows the bar's limit and its spending in the limit's currency: a
 * parent whose limit comes from its subcategories has a row, and an archived category has none.
 * `leftOut` names, comma-separated, each currency left out for lack of an exchange rate, as the
 * screen's warning does: it covers the whole month's ledger and, for a parent, its subcategories'
 * limits. `spent` stays filled, because one such entry would otherwise blank every row of that
 * month.
 * The ledger is read once per currency for the whole run.
 */
export async function* budgetSpreadsheetPages(
  sql: postgres.Sql,
  groupId: string,
  now: Date,
): AsyncGenerator<BudgetSpreadsheetRow[]> {
  const budgets = new PostgresBudgetRepository(sql)
  const [zone, categories, { baseCurrency }, names, stored] = await Promise.all([
    budgets.timeZoneOf(groupId),
    budgets.categories(groupId),
    new PostgresHouseholdSettingsRepository(sql).get(groupId),
    sql<
      { id: string; name: string }[]
    >`SELECT id, name FROM categories WHERE group_id = ${groupId}`,
    sql<{ categoryId: string; month: string; amount: string | null; currency: string | null }[]>`
      SELECT category_id, to_char(month, 'YYYY-MM') AS month, amount::text AS amount, currency
      FROM budgets WHERE group_id = ${groupId}
      ORDER BY month
    `,
  ])
  const live = new Set(categories.filter((category) => !category.archived).map(({ id }) => id))
  const earliest = stored.find((row) => row.amount !== null && live.has(row.categoryId))?.month
  if (earliest === undefined) return

  const timeZone = groupTimeZone({ timeZone: zone })
  const current = currentPeriod(PeriodUnit.Month, { now, timeZone }).from
  const oldest = shiftMonth(current, 1 - BUDGET_SPREADSHEET_MONTHS_MAX)
  const start = `${earliest}-01` < oldest ? oldest : `${earliest}-01`
  const today = isoDateInTz(now, timeZone)

  const rates = new PostgresRateRepository(sql)
  const rate: EntryRateLookup = async (base, quote, date) => {
    const lookup = await rates.lookup(base, quote, date)
    return lookup.found ? lookup.rate : null
  }
  const transactions = new PostgresTransactionRepository(sql, rates)
  const ledgers = new Map<string, Promise<Ledger[]>>()
  const ledgersIn = (currency: string) => {
    const read = ledgers.get(currency) ??
      transactions.ledgerMonths(groupId, currency, start, endOfMonth(current))
    ledgers.set(currency, read)
    return read
  }

  const nameOf = new Map(names.map(({ id, name }) => [id, name]))
  const limits = new Map<string, { amount: number; currency: string }>()
  let applied = 0
  for (let first = start, index = 0; first <= current; first = shiftMonth(first, 1), index++) {
    const month = first.slice(0, 7)
    // A month's limit is the latest row at or before it; a row with no amount removes the limit.
    for (; applied < stored.length && stored[applied].month <= month; applied++) {
      const { categoryId, amount, currency } = stored[applied]
      if (amount === null || currency === null) limits.delete(categoryId)
      else limits.set(categoryId, { amount: Number(amount), currency })
    }
    const period = periodOf(PeriodUnit.Month, first)
    const { rows } = await budgetMonth(
      { month, from: period.from, to: period.to, today, baseCurrency, categories, limits },
      { ledger: async (currency) => (await ledgersIn(currency))[index], rate },
    )
    yield rows.flatMap((row) => {
      if (row.limit === null) return []
      const name = nameOf.get(row.categoryId)!
      return [{
        month,
        // Sibling names are unique only under one parent.
        category: row.parentId === null ? name : `${nameOf.get(row.parentId)} / ${name}`,
        limit: amountCell(row.limit.amount, row.limit.currency),
        currency: row.limit.currency,
        spent: amountCell(row.spending, row.limit.currency),
        leftOut: row.leftOut.join(`, `),
      }]
    })
  }
}

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
 * category is now an income category is skipped, as the reads ignore it. No plan cap counts them,
 * and the plan's `budgets` feature gates only setting an amount, so they import on any plan. In
 * the spreadsheets, `budgets.csv` has a row per category and month ({@link budgetSpreadsheetPages}).
 */
export const budgetPortable = portable<BudgetExportEntry, BudgetSpreadsheetRow>({
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
  csv: {
    columns: [
      { key: `month`, header: `BudgetSpreadsheet.month` },
      { key: `category`, header: `BudgetSpreadsheet.category` },
      { key: `limit`, header: `BudgetSpreadsheet.limit` },
      { key: `currency`, header: `BudgetSpreadsheet.currency` },
      { key: `spent`, header: `BudgetSpreadsheet.spent` },
      { key: `leftOut`, header: `BudgetSpreadsheet.leftOut` },
    ],
    read: (sql, groupId) => budgetSpreadsheetPages(sql, groupId, new Date()),
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
 * categories; one whose category the file lacks refuses the whole import. One naming a category
 * that is now an income category is kept: the budget read counts each side that is still an
 * expense category, so dropping it would change that side's envelope.
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
    const rows = moves.map((move) => {
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
