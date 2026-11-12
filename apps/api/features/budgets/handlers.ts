import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  assertCanReadBudgets,
  assertCanSetBudgetMethod,
  assertCanWriteBudgets,
  type BudgetLimit,
  budgetMethodAt,
  BudgetMethodSetCommand,
  type BudgetMonth,
  budgetMonth,
  BudgetMonthQuery,
  BudgetMoveCommand,
  type BudgetRepository,
  BudgetSetCommand,
  envelopeMonth,
  envelopeRunStart,
} from "@domain/budgets"
import type { EntryRateLookup, Ledger } from "@domain/transactions"
import { groupTimeZone } from "@domain/groups"
import type { HouseholdSettings } from "@domain/money"
import type { GroupRoleLookup } from "@domain/notes"
import { currentPeriod, periodOf, PeriodUnit } from "@spy4x/time/period"
import { isoDateInTz } from "@spy4x/time/tz"
import { endOfMonth, shiftMonth } from "@spy4x/time/date"

/**
 * What the budget handlers need: the budgets, the actor's role in the household, its base
 * currency, the one ledger read the entries serve, the rate lookup it uses, and the clock that
 * says which month "this month" is.
 */
export interface BudgetHandlerDependencies {
  budgets: BudgetRepository
  groups: GroupRoleLookup
  settings: { get(groupId: string): Promise<Pick<HouseholdSettings, "baseCurrency">> }
  /** `TransactionRepository.ledger`: the household's ledger for a period in a currency. */
  ledger(groupId: string, currency: string, from: string, to: string): Promise<Ledger>
  /** `TransactionRepository.ledgerMonths`: one ledger per month of a run, from one read. */
  ledgerMonths(groupId: string, currency: string, from: string, to: string): Promise<Ledger[]>
  rate: EntryRateLookup
  /** The current instant; a test passes a fixed one. */
  now: () => Date
}

/**
 * Sets or removes a category's limit from a month on. It decides who may act before it touches a
 * row: an editor or above writes, and a stranger is told the household does not exist. The
 * repository checks the role again inside the write's transaction, so a set that races a removal
 * or a demotion is refused too. No currency is the household's base currency; a removal has none.
 */
export function createBudgetSetHandler(
  { budgets, groups, settings }: BudgetHandlerDependencies,
): CommandHandler<BudgetSetCommand> {
  return async ({ data }) => {
    assertCanWriteBudgets(await groups.roleOf(data.groupId, data.actor.userId))
    const currency = data.amount === null
      ? null
      : data.currency ?? (await settings.get(data.groupId)).baseCurrency
    const budget = await budgets.set(
      {
        groupId: data.groupId,
        categoryId: data.categoryId,
        month: data.month,
        amount: data.amount,
        currency,
        expectedVersion: data.expectedVersion,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { budget }
  }
}

/** The household's current month, `YYYY-MM`, in its time zone (R14). */
async function currentMonthOf(
  budgets: BudgetRepository,
  groupId: string,
  now: Date,
): Promise<string> {
  const timeZone = groupTimeZone({ timeZone: await budgets.timeZoneOf(groupId) })
  return currentPeriod(PeriodUnit.Month, { now, timeZone }).from.slice(0, 7)
}

/**
 * Switches the household's budgeting method from its current month on, in its time zone, so
 * every past month keeps the method it had. An admin or the owner switches it, the role that
 * changes the main currency; the repository checks the role again inside the write.
 */
export function createBudgetMethodSetHandler(
  { budgets, groups, now }: BudgetHandlerDependencies,
): CommandHandler<BudgetMethodSetCommand> {
  return async ({ data }) => {
    assertCanSetBudgetMethod(await groups.roleOf(data.groupId, data.actor.userId))
    const method = await budgets.setMethod(
      {
        groupId: data.groupId,
        month: await currentMonthOf(budgets, data.groupId, now()),
        method: data.method,
        expectedVersion: data.expectedVersion,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { method }
  }
}

/**
 * Moves money between two envelopes in one month, in the household's main currency, for an
 * editor or above. The repository refuses a month that is not an envelope month and answers a
 * retried move with the one it stored.
 */
export function createBudgetMoveHandler(
  { budgets, groups, settings }: BudgetHandlerDependencies,
): CommandHandler<BudgetMoveCommand> {
  return async ({ data }) => {
    assertCanWriteBudgets(await groups.roleOf(data.groupId, data.actor.userId))
    const move = await budgets.move(
      {
        id: data.id,
        groupId: data.groupId,
        month: data.month,
        fromCategoryId: data.fromCategoryId,
        toCategoryId: data.toCategoryId,
        amount: data.amount,
        currency: (await settings.get(data.groupId)).baseCurrency,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { move }
  }
}

/**
 * A month of the household's bars, for any member. No month is the current one in the household's
 * time zone (R14), so every member sees the same month at midnight on the 1st wherever they are.
 */
export function createBudgetMonthHandler(
  dependencies: BudgetHandlerDependencies,
): QueryHandler<BudgetMonthQuery> {
  const { budgets, groups, settings, ledger, rate, now } = dependencies
  return async ({ data }) => {
    assertCanReadBudgets(await groups.roleOf(data.groupId, data.actor.userId))
    const timeZone = groupTimeZone({ timeZone: await budgets.timeZoneOf(data.groupId) })
    const clock = { now: now(), timeZone }
    const period = data.month === undefined
      ? currentPeriod(PeriodUnit.Month, clock)
      : periodOf(PeriodUnit.Month, `${data.month}-01`)
    const month = period.from.slice(0, 7)
    const [{ baseCurrency }, categories, rows, methods] = await Promise.all([
      settings.get(data.groupId),
      budgets.categories(data.groupId),
      budgets.limitsAt(data.groupId, month),
      budgets.methodsUpTo(data.groupId, month),
    ])
    const limits = new Map<string, BudgetLimit>()
    for (const row of rows) {
      if (row.amount !== null && row.currency !== null) {
        limits.set(row.categoryId, { amount: row.amount, currency: row.currency })
      }
    }
    const today = isoDateInTz(clock.now, timeZone)
    const limitsMonth = await budgetMonth(
      { month, from: period.from, to: period.to, today, baseCurrency, categories, limits },
      {
        ledger: (currency) => ledger(data.groupId, currency, period.from, period.to),
        rate,
      },
    )
    const method = budgetMethodAt(methods, month)
    const read: BudgetMonth = {
      ...limitsMonth,
      method,
      methodVersion: methods.find((row) => row.month === month)?.version ?? null,
    }
    const start = envelopeRunStart(methods, month)
    if (start === null) return { budgets: read }
    return {
      budgets: await withEnvelopes(read, start, today, {
        ...dependencies,
        groupId: data.groupId,
      }),
    }
  }
}

/**
 * Adds the envelopes to a month read: the run's assignments, moves and ledger, each in one read
 * from `start` to the month, then {@link envelopeMonth}. A month's assignments and moves convert
 * at the rate of its last day, or of `today` while it runs, as a parent's limit does.
 */
async function withEnvelopes(
  read: BudgetMonth,
  start: string,
  today: string,
  dependencies: BudgetHandlerDependencies & { groupId: string },
): Promise<BudgetMonth> {
  const { budgets, ledgerMonths, rate, groupId } = dependencies
  const [assignments, moves, ledgers] = await Promise.all([
    budgets.assignmentsIn(groupId, start, read.month),
    budgets.moveTotalsIn(groupId, start, read.month),
    ledgerMonths(groupId, read.baseCurrency, `${start}-01`, read.to),
  ])
  const months = ledgers.map((ledger, index) => {
    const first = shiftMonth(`${start}-01`, index)
    const last = endOfMonth(first)
    return { month: first.slice(0, 7), ledger, rateDate: last < today ? last : today }
  })
  const envelopes = await envelopeMonth({
    baseCurrency: read.baseCurrency,
    categories: read.rows.map((row) => ({ id: row.categoryId, parentId: row.parentId })),
    months,
    assignments,
    moves,
  }, rate)
  return {
    ...read,
    rows: read.rows.map((row) => ({ ...row, envelope: envelopes.envelopes.get(row.categoryId) })),
    readyToAssign: envelopes.readyToAssign,
    envelopeLeftOut: envelopes.leftOut,
  }
}
