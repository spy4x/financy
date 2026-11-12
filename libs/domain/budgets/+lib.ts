import { type Type, type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import type { Actor } from "@domain/identity"
import { canMutateNotes, canRead, type GroupRole } from "@domain/groups"
import { CategoryKind } from "@domain/categories"
import type { EntryRateLookup, Ledger } from "@domain/transactions"
import { convertMoney, currencyCode } from "@spy4x/platform/universal/money"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { parseIsoDate } from "@spy4x/time/date"
import { type FieldErrors, fieldErrors } from "@spy4x/validation"

/**
 * Budgets: a household's monthly limit on an expense category, copied from the entries aggregate.
 * A row holds one category's amount from one month on; a month's limit is the latest row at or
 * before it, so changing November leaves October as it was. A row with no amount removes the
 * limit from its month on: nothing is deleted. The rows name no budgeting method, so a later
 * envelope method can add rollover on the same rows. Every member reads a household's budgets
 * and an editor or above sets them. `docs/aggregates.md` walks through the files.
 */

/** The largest limit, in the currency's smallest unit: it crosses JSON as an exact number. */
export const BUDGET_AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/** The outbox event kind a budget change is recorded under, on the group's change log. */
export const BUDGET_EVENTS = { set: "budget.set" } as const

/** How full a month's bar is (R15): the numbers are stable, so a client may keep them. */
export enum BudgetBand {
  /** Below 80% of the limit. */
  GREEN = 1,
  /** From 80%. */
  YELLOW = 2,
  /** From 95%, up to and including the limit. */
  ORANGE = 3,
  /** Past the limit. */
  RED = 4,
}

/** Where a bar's limit came from. */
export enum BudgetLimitSource {
  /** The category's own limit. */
  OWN = 1,
  /** A parent without its own limit: the sum of its children's (R13). */
  CHILDREN = 2,
}

export type BudgetErrorCode =
  | "BUDGET_INCOME_CATEGORY"
  | "CATEGORY_ARCHIVED"
  | "CATEGORY_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "INVALID_REQUEST"
  | "ROLE_INSUFFICIENT"
  | "VERSION_CONFLICT"

export class BudgetError extends Error {
  constructor(
    public readonly code: BudgetErrorCode,
    message: string,
    /** Each failed field's code and rule, when a schema or a rule refused the request. */
    public readonly fields?: FieldErrors,
  ) {
    super(message)
    this.name = "BudgetError"
  }
}

/**
 * A set named a version the month's row has moved past, or `null` while a row exists. It carries
 * the row's version now, `null` when the month has no row, so the client can reread it.
 */
export class BudgetVersionConflictError extends BudgetError {
  constructor(public readonly currentVersion: number | null) {
    super("VERSION_CONFLICT", "The budget was changed by someone else")
    this.name = "BudgetVersionConflictError"
  }
}

/** One month's row of a category's budget, as the API returns it. */
export interface Budget {
  id: string
  groupId: string
  categoryId: string
  /** The month the row starts in, `YYYY-MM`. */
  month: string
  /** The limit in `currency`'s smallest unit; `null` removes the limit from this month on. */
  amount: number | null
  /** An ISO 4217 code; `null` exactly when `amount` is. */
  currency: string | null
  /** Starts at 1 and grows by one with every change; a set must name it. */
  version: number
  /** The group's change sequence this row was last written at, as a decimal string (BIGINT). */
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: Date
  updatedAt: Date
}

// #region Request schemas
/** A calendar month, `YYYY-MM`, from year 1: the day is always the 1st, so no range is taken. */
export const calendarMonth: Type<string> = type(`string`).narrow((value, ctx) => {
  if (!/^\d{4}-\d{2}$/.test(value) || value.startsWith(`0000`)) {
    return ctx.mustBe(`a month like 2026-11`)
  }
  try {
    parseIsoDate(`${value}-01`)
    return true
  } catch {
    return ctx.mustBe(`a month like 2026-11`)
  }
})

const groupIdField = { groupId: UUID_PATTERN } as const

/**
 * The `budget.set` payload. `amount` is a whole number of the currency's smallest unit above zero,
 * or `null` to remove the limit from `month` on. No `currency` is the household's base currency.
 * `expectedVersion` is `null` when the person saw no row for that month, else the row's version.
 */
export const budgetSetPayloadSchema = type({
  ...groupIdField,
  categoryId: UUID_PATTERN,
  month: calendarMonth,
  amount: type(`1 <= number.integer <= ${BUDGET_AMOUNT_MAX}`).or(`null`),
  "currency?": currencyCode,
  expectedVersion: type(`number.integer >= 1`).or(`null`),
  "+": "reject",
})

/** The `budget.month` payload: no month is the current one in the household's time zone. */
export const budgetMonthPayloadSchema = type({
  ...groupIdField,
  "month?": calendarMonth,
  "+": "reject",
})

/**
 * Validates `value` against `schema`, and refuses a currency sent with no amount: a removed limit
 * has none. Throws `BudgetError("INVALID_REQUEST")`.
 */
export function parseBudgetRequest<S extends Type<object>>(schema: S, value: unknown): S["infer"] {
  const result = schema(value)
  if (result instanceof type.errors) {
    throw new BudgetError("INVALID_REQUEST", result.summary, fieldErrors(result))
  }
  const parsed = result as S["infer"] & { amount?: number | null; currency?: string }
  if (parsed.amount === null && parsed.currency !== undefined) {
    throw new BudgetError("INVALID_REQUEST", "A removed limit has no currency", {
      currency: { code: "forbidden" },
    })
  }
  return parsed
}
// #endregion Request schemas

// #region Authorization
/**
 * Throws unless `role` may read the household's budgets. `null` means the actor is not a member,
 * which answers "group not found" so a stranger cannot tell a household exists.
 */
export function assertCanReadBudgets(role: GroupRole | null): void {
  if (role === null || !canRead(role)) {
    throw new BudgetError("GROUP_NOT_FOUND", "Group not found")
  }
}

/** Throws unless `role` may set or remove a limit (R16). */
export function assertCanWriteBudgets(role: GroupRole | null): void {
  assertCanReadBudgets(role)
  if (!canMutateNotes(role!)) {
    throw new BudgetError("ROLE_INSUFFICIENT", "Only an editor can change budgets")
  }
}

/**
 * Checks the category a set names, read inside the household (R12, R17): another household's or
 * an unknown one is `CATEGORY_NOT_FOUND`, an income category carries no limit, and an archived one
 * takes no new amount but may have its limit removed.
 */
export function assertBudgetCategory(
  category: { kind: CategoryKind; archived: boolean } | null,
  amount: number | null,
): void {
  if (category === null) {
    throw new BudgetError("CATEGORY_NOT_FOUND", "Category not found", {
      categoryId: { code: "notFound" },
    })
  }
  if (category.kind !== CategoryKind.EXPENSE) {
    throw new BudgetError("BUDGET_INCOME_CATEGORY", "Only an expense category has a budget", {
      categoryId: { code: "kindMismatch" },
    })
  }
  if (category.archived && amount !== null) {
    throw new BudgetError("CATEGORY_ARCHIVED", "An archived category takes no new limit", {
      categoryId: { code: "archived" },
    })
  }
}
// #endregion Authorization

// #region Commands and queries
export interface BudgetSetPayload {
  actor: Actor
  groupId: string
  categoryId: string
  month: string
  amount: number | null
  currency?: string
  expectedVersion: number | null
  /** The request this came from. */
  requestId?: string
  /** Makes a retry of this command safe; see the idempotency middleware on the command bus. */
  idempotencyKey?: string
}

/** Sets or removes a category's limit from a month on. */
export class BudgetSetCommand implements Command<BudgetSetPayload, { budget: Budget }> {
  __resultType?: { budget: Budget }
  constructor(public data: BudgetSetPayload) {}
}

export interface BudgetMonthPayload {
  actor: Actor
  groupId: string
  month?: string
}

export class BudgetMonthQuery implements Query<BudgetMonthPayload, { budgets: BudgetMonth }> {
  __resultType?: { budgets: BudgetMonth }
  constructor(public data: BudgetMonthPayload) {}
}
// #endregion Commands and queries

// #region Month
/** A limit as a bar compares with it. */
export interface BudgetLimit {
  amount: number
  currency: string
}

/** A live expense category, as the month lists it. */
export interface BudgetCategory {
  id: string
  parentId: string | null
}

/** One category's bar for one month. */
export interface BudgetRow {
  categoryId: string
  parentId: string | null
  /** `null` when neither the category nor, for a parent, its children have one. */
  limit: BudgetLimit | null
  source: BudgetLimitSource | null
  /**
   * The month's expenses less refunds in the category, a parent's with its children's (R13), in
   * {@link currency}; `null` only when the sum is past the safe range.
   */
  spending: number | null
  /** The limit's currency, or the household's base currency when there is no limit. */
  currency: string
  band: BudgetBand | null
  /** Spending as a whole percent of the limit, rounded down; `null` with no band. */
  percent: number | null
  /** Currencies left out for lack of a rate, in the spending or in a child's limit (R8). */
  leftOut: string[]
}

/** A month of a household's budgets. */
export interface BudgetMonth {
  /** `YYYY-MM`. */
  month: string
  from: string
  to: string
  baseCurrency: string
  /** Each live expense category, every parent followed by its children. */
  rows: BudgetRow[]
}

/**
 * The band and whole percent of `spending` against a `limit` above zero (R15). Integers only:
 * below 80% green, from 80% yellow, from 95% up to exactly 100% orange, past it red, so 100.01% is
 * red though it reports 100. Refunds past the spending read as 0%.
 */
export function budgetBand(spending: number, limit: number): { band: BudgetBand; percent: number } {
  const spent = BigInt(Math.max(spending, 0)) * 100n
  const cap = BigInt(limit)
  const band = spent < cap * 80n
    ? BudgetBand.GREEN
    : spent < cap * 95n
    ? BudgetBand.YELLOW
    : spent <= cap * 100n
    ? BudgetBand.ORANGE
    : BudgetBand.RED
  return { band, percent: Number(spent / cap) }
}

/** What {@link budgetMonth} reads besides the month's rows. */
export interface BudgetMonthReaders {
  /** The household's ledger for the month in `currency` (R15): one call per distinct currency. */
  ledger(currency: string): Promise<Ledger>
  rate: EntryRateLookup
}

/**
 * A parent's limit from its children's (R13). One shared currency is summed as it is. Mixed
 * currencies are each converted to `baseCurrency` at the rate of `rateDate`; a limit with no rate
 * is left out and named, never counted as zero. `null` when nothing could be counted or the sum is
 * past the safe range.
 */
async function childrenLimit(
  limits: readonly BudgetLimit[],
  baseCurrency: string,
  rateDate: string,
  rate: EntryRateLookup,
): Promise<{ limit: BudgetLimit | null; leftOut: string[] }> {
  const currencies = new Set(limits.map((limit) => limit.currency))
  const currency = currencies.size === 1 ? limits[0].currency : baseCurrency
  const leftOut = new Set<string>()
  let sum = 0n
  let counted = 0
  for (const limit of limits) {
    const converted = limit.currency === currency
      ? { ok: true as const, value: limit.amount }
      : convertMoney(
        limit.amount,
        limit.currency,
        currency,
        await rate(limit.currency, currency, rateDate),
      )
    if (!converted.ok) {
      leftOut.add(limit.currency)
      continue
    }
    sum += BigInt(converted.value)
    counted++
  }
  const usable = counted > 0 && sum > 0n && sum <= BigInt(Number.MAX_SAFE_INTEGER)
  return { limit: usable ? { amount: Number(sum), currency } : null, leftOut: [...leftOut] }
}

/**
 * One month of bars (R13, R15). `categories` are the household's live expense categories in the
 * order to show them; each parent is followed by its children, and a child whose parent is not
 * listed stands on its own. `limits` holds each category's limit in effect that month. A bar with
 * no limit shows spending in `baseCurrency`. Spending comes from the household's ledger, read once
 * per currency the bars need, so refunds lower it and a parent's includes its children's; a
 * month's limit never carries what an earlier month left unspent. A parent without its own limit
 * compares with its children's, converted at the rate of the month's last day, or of `today`
 * while the month runs.
 */
export async function budgetMonth(
  input: {
    month: string
    from: string
    to: string
    today: string
    baseCurrency: string
    categories: readonly BudgetCategory[]
    limits: ReadonlyMap<string, BudgetLimit>
  },
  readers: BudgetMonthReaders,
): Promise<BudgetMonth> {
  const { baseCurrency, categories, limits } = input
  const rateDate = input.to < input.today ? input.to : input.today
  const listed = new Set(categories.map((category) => category.id))
  const tops = categories.filter((category) =>
    category.parentId === null || !listed.has(category.parentId)
  )
  const childrenOf = (id: string) => categories.filter((category) => category.parentId === id)
  const ordered = tops.flatMap((top) => [top, ...childrenOf(top.id)])

  const bars = await Promise.all(ordered.map(async (category) => {
    const own = limits.get(category.id)
    if (own) return { category, limit: own, source: BudgetLimitSource.OWN, leftOut: [] }
    const childLimits = childrenOf(category.id).flatMap((child) => limits.get(child.id) ?? [])
    if (childLimits.length === 0) return { category, limit: null, source: null, leftOut: [] }
    const derived = await childrenLimit(childLimits, baseCurrency, rateDate, readers.rate)
    return { category, ...derived, source: BudgetLimitSource.CHILDREN }
  }))

  const currencies = [...new Set(bars.map((bar) => bar.limit?.currency ?? baseCurrency))]
  const ledgers = new Map(
    await Promise.all(
      currencies.map(async (currency) => [currency, await readers.ledger(currency)] as const),
    ),
  )
  const rows = bars.map(({ category, limit, source, leftOut }): BudgetRow => {
    const currency = limit?.currency ?? baseCurrency
    const ledger = ledgers.get(currency)!
    const spending = ledger.tooLarge
      ? null
      : ledger.categories.find((entry) => entry.categoryId === category.id)?.spending ?? 0
    const band = limit && spending !== null ? budgetBand(spending, limit.amount) : null
    return {
      categoryId: category.id,
      parentId: category.parentId,
      limit,
      source,
      spending,
      currency,
      band: band?.band ?? null,
      percent: band?.percent ?? null,
      leftOut: [...new Set([...ledger.leftOut, ...leftOut])].sort(),
    }
  })
  return { month: input.month, from: input.from, to: input.to, baseCurrency, rows }
}
// #endregion Month

// #region Ports
export interface BudgetSetInput {
  groupId: string
  categoryId: string
  month: string
  amount: number | null
  /** `null` exactly when `amount` is. */
  currency: string | null
  expectedVersion: number | null
  requestId?: string
}

/**
 * Where budgets are kept. A set checks the actor's role again on the locked membership row
 * (`lockActorRole`), reads the category inside the household under that lock
 * ({@link assertBudgetCategory}), upserts the month's row at the version named and records one
 * change on the group, in one transaction.
 */
export interface BudgetRepository {
  /**
   * Writes the month's row. Throws the refusals of {@link assertBudgetCategory} and
   * {@link BudgetVersionConflictError}. A new row gets a version 7 id.
   */
  set(input: BudgetSetInput, actorId: number): Promise<Budget>
  /** Each category's latest row at or before `month` (`YYYY-MM`), rows with no amount included. */
  limitsAt(groupId: string, month: string): Promise<Budget[]>
  /** The household's live expense categories, by name. */
  categories(groupId: string): Promise<BudgetCategory[]>
  /** The household's time zone, the one its months are cut in (R14). */
  timeZoneOf(groupId: string): Promise<string | null>
}
// #endregion Ports
