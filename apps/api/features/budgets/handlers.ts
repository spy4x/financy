import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  assertCanReadBudgets,
  assertCanWriteBudgets,
  type BudgetLimit,
  budgetMonth,
  BudgetMonthQuery,
  type BudgetRepository,
  BudgetSetCommand,
} from "@domain/budgets"
import type { EntryRateLookup, Ledger } from "@domain/transactions"
import { groupTimeZone } from "@domain/groups"
import type { HouseholdSettings } from "@domain/money"
import type { GroupRoleLookup } from "@domain/notes"
import { currentPeriod, periodOf, PeriodUnit } from "@spy4x/time/period"
import { isoDateInTz } from "@spy4x/time/tz"

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
    const [{ baseCurrency }, categories, rows] = await Promise.all([
      settings.get(data.groupId),
      budgets.categories(data.groupId),
      budgets.limitsAt(data.groupId, month),
    ])
    const limits = new Map<string, BudgetLimit>()
    for (const row of rows) {
      if (row.amount !== null && row.currency !== null) {
        limits.set(row.categoryId, { amount: row.amount, currency: row.currency })
      }
    }
    return {
      budgets: await budgetMonth(
        {
          month,
          from: period.from,
          to: period.to,
          today: isoDateInTz(clock.now, timeZone),
          baseCurrency,
          categories,
          limits,
        },
        {
          ledger: (currency) => ledger(data.groupId, currency, period.from, period.to),
          rate,
        },
      ),
    }
  }
}
