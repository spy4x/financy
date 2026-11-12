import { type Type, type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import type { Actor } from "@domain/identity"
import { canMutateNotes, canRead, canRename, type GroupRole } from "@domain/groups"
import { CategoryKind } from "@domain/categories"
import type { EntryRateLookup, Ledger } from "@domain/transactions"
import { convertMoney, currencyCode } from "@spy4x/platform/universal/money"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { parseIsoDate, shiftMonth } from "@spy4x/time/date"
import { type FieldErrors, fieldErrors } from "@spy4x/validation"

/**
 * Budgets: a household's monthly limit on an expense category, copied from the entries aggregate.
 * A row holds one category's amount from one month on; a month's limit is the latest row at or
 * before it, so changing November leaves October as it was. A row with no amount removes the
 * limit from its month on: nothing is deleted. Every member reads a household's budgets and an
 * editor or above sets them. `docs/aggregates.md` walks through the files.
 *
 * A household also picks its budgeting method ({@link BudgetMethod}) from a month on, the same
 * way: an admin or the owner switches it, and the switch starts in the household's current month,
 * so every past month keeps the method it had. Under envelopes the same rows are each month's
 * assignment to a category, exactly that month's and never carried forward, money moves between
 * envelopes ({@link BudgetMove}), and each envelope's balance rolls over
 * ({@link envelopeMonth}). Balances are computed from the ledger on every read, never stored.
 */

/** The largest limit, in the currency's smallest unit: it crosses JSON as an exact number. */
export const BUDGET_AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/** The outbox event kind a budget change is recorded under, on the group's change log. */
export const BUDGET_EVENTS = {
  set: "budget.set",
  methodSet: "budget.method.set",
  move: "budget.move",
} as const

/** How a household budgets a month: the numbers are stored, so they never change. */
export enum BudgetMethod {
  /** A limit per category, the latest one carried forward; nothing rolls over. The default. */
  LIMITS = 1,
  /** Envelopes: money assigned each month, moved between envelopes, its balance rolled over. */
  ENVELOPES = 2,
}

/**
 * The most months an envelope read walks back. A run of envelope months longer than this is read
 * from this many months before the month asked for, with nothing carried into its first month, so
 * one read costs at most this many months of the ledger, whatever the household's history.
 */
export const ENVELOPE_RUN_MAX_MONTHS = 60

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
  | "ID_ALREADY_EXISTS"
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

/** A household's budgeting method from one month on, as the API returns it. */
export interface BudgetMethodSetting {
  id: string
  groupId: string
  /** The month the method starts in, `YYYY-MM`. */
  month: string
  method: BudgetMethod
  /** Starts at 1 and grows by one with every change of this month's row; a switch must name it. */
  version: number
  /** The group's change sequence this row was last written at, as a decimal string (BIGINT). */
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: Date
  updatedAt: Date
}

/** Money moved from one envelope to another in one month. It is never edited or deleted. */
export interface BudgetMove {
  /** Made by the client, so a retried move finds the first one. */
  id: string
  groupId: string
  /** `YYYY-MM`. */
  month: string
  fromCategoryId: string
  toCategoryId: string
  /** Above zero, in `currency`'s smallest unit. */
  amount: number
  /** The household's main currency when the move was made. */
  currency: string
  changeSequence: string
  createdByUserId: number | null
  createdAt: Date
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

/**
 * The `budget.method.set` payload. It names no month: a switch always starts in the household's
 * current month. `expectedVersion` is `null` when that month has no method row of its own, else
 * its version, which the month read returns as `methodVersion`.
 */
export const budgetMethodSetPayloadSchema = type({
  ...groupIdField,
  method: type.enumerated(BudgetMethod.LIMITS, BudgetMethod.ENVELOPES),
  expectedVersion: type(`number.integer >= 1`).or(`null`),
  "+": "reject",
})

/**
 * The `budget.move` payload: `amount` of the household's main currency, in its smallest unit, from
 * one envelope to another in `month`. The client makes `id`, so a retry moves nothing twice.
 */
export const budgetMovePayloadSchema = type({
  id: UUID_PATTERN,
  ...groupIdField,
  month: calendarMonth,
  fromCategoryId: UUID_PATTERN,
  toCategoryId: UUID_PATTERN,
  amount: type(`1 <= number.integer <= ${BUDGET_AMOUNT_MAX}`),
  "+": "reject",
})

/** The `budget.month` payload: no month is the current one in the household's time zone. */
export const budgetMonthPayloadSchema = type({
  ...groupIdField,
  "month?": calendarMonth,
  "+": "reject",
})

/**
 * Validates `value` against `schema`, refuses a currency sent with no amount (a removed limit has
 * none) and a move into the envelope it comes from. Throws `BudgetError("INVALID_REQUEST")`.
 */
export function parseBudgetRequest<S extends Type<object>>(schema: S, value: unknown): S["infer"] {
  const result = schema(value)
  if (result instanceof type.errors) {
    throw new BudgetError("INVALID_REQUEST", result.summary, fieldErrors(result))
  }
  const parsed = result as S["infer"] & {
    amount?: number | null
    currency?: string
    fromCategoryId?: string
    toCategoryId?: string
  }
  if (parsed.amount === null && parsed.currency !== undefined) {
    throw new BudgetError("INVALID_REQUEST", "A removed limit has no currency", {
      currency: { code: "forbidden" },
    })
  }
  if (parsed.fromCategoryId !== undefined && parsed.fromCategoryId === parsed.toCategoryId) {
    throw new BudgetError("INVALID_REQUEST", "A move goes to another envelope", {
      toCategoryId: { code: "same" },
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
 * Throws unless `role` may switch the household's budgeting method: an admin or the owner, the
 * rule that changes the main currency (`assertCanChangeHouseholdSettings`).
 */
export function assertCanSetBudgetMethod(role: GroupRole | null): void {
  assertCanReadBudgets(role)
  if (!canRename(role!)) {
    throw new BudgetError(
      "ROLE_INSUFFICIENT",
      "Only an admin or the owner can change how the household budgets",
    )
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

export interface BudgetMethodSetPayload {
  actor: Actor
  groupId: string
  method: BudgetMethod
  expectedVersion: number | null
  requestId?: string
  idempotencyKey?: string
}

/** Switches the household's budgeting method from its current month on. */
export class BudgetMethodSetCommand
  implements Command<BudgetMethodSetPayload, { method: BudgetMethodSetting }> {
  __resultType?: { method: BudgetMethodSetting }
  constructor(public data: BudgetMethodSetPayload) {}
}

export interface BudgetMovePayload {
  actor: Actor
  id: string
  groupId: string
  month: string
  fromCategoryId: string
  toCategoryId: string
  amount: number
  requestId?: string
  idempotencyKey?: string
}

/** Moves money from one envelope to another in one month. */
export class BudgetMoveCommand implements Command<BudgetMovePayload, { move: BudgetMove }> {
  __resultType?: { move: BudgetMove }
  constructor(public data: BudgetMovePayload) {}
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
  /** The category's envelope, only in a month the household budgets with envelopes. */
  envelope?: BudgetEnvelope
}

/**
 * One envelope's month, in the household's main currency. A parent's sums its own envelope and its
 * children's (R13). Each figure is `null` only when a sum in the run is past the safe range.
 */
export interface BudgetEnvelope {
  /** The budget row of exactly this month; none, or one with no amount, is 0. */
  assigned: number | null
  movedIn: number | null
  movedOut: number | null
  /** Expenses less refunds (R15). */
  spent: number | null
  /** What last month left, when above zero, plus assigned and moved in, less moved out and spent. */
  available: number | null
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
  /** How the household budgets this month. */
  method: BudgetMethod
  /**
   * The version of the method row that starts in this month, `null` when it has none. Read for the
   * current month, it is what `budget.method.set` expects.
   */
  methodVersion: number | null
  /**
   * Under envelopes only: last month's ready to assign, plus this month's income, less what this
   * month assigned and what last month overspent, in the main currency. `null` past the safe range.
   */
  readyToAssign?: number | null
  /** Under envelopes only: currencies the envelope figures left out for lack of a rate (R8). */
  envelopeLeftOut?: string[]
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
  return {
    month: input.month,
    from: input.from,
    to: input.to,
    baseCurrency,
    rows,
    method: BudgetMethod.LIMITS,
    methodVersion: null,
  }
}

/** A method row as the month reads it. */
export interface BudgetMethodMonth {
  /** `YYYY-MM`. */
  month: string
  method: BudgetMethod
}

/** The method of `month` (`YYYY-MM`): the latest row at or before it; none is monthly limits. */
export function budgetMethodAt(rows: readonly BudgetMethodMonth[], month: string): BudgetMethod {
  return latestAtOrBefore(rows, month)?.method ?? BudgetMethod.LIMITS
}

/**
 * The first month (`YYYY-MM`) of the run of envelope months `month` is in, or `null` when `month`
 * is not an envelope month. The run starts at the latest switch to envelopes after a month of
 * limits, or at the first switch, and never more than {@link ENVELOPE_RUN_MAX_MONTHS} months back.
 */
export function envelopeRunStart(rows: readonly BudgetMethodMonth[], month: string): string | null {
  const earlier = rows.filter((row) => row.month <= month).sort((a, b) =>
    a.month < b.month ? 1 : -1
  )
  let start: string | null = null
  for (const row of earlier) {
    if (row.method !== BudgetMethod.ENVELOPES) break
    start = row.month
  }
  if (start === null) return null
  const earliest = shiftMonth(`${month}-01`, 1 - ENVELOPE_RUN_MAX_MONTHS).slice(0, 7)
  return start < earliest ? earliest : start
}

function latestAtOrBefore<T extends { month: string }>(
  rows: readonly T[],
  month: string,
): T | null {
  let latest: T | null = null
  for (const row of rows) {
    if (row.month <= month && (latest === null || row.month > latest.month)) latest = row
  }
  return latest
}

/** An amount in a currency, assigned to a category in a month (`YYYY-MM`). */
export interface BudgetAssignment {
  month: string
  categoryId: string
  amount: number
  currency: string
}

/** A month's moves into and out of one category in one currency, summed. */
export interface BudgetMoveTotal {
  /** `YYYY-MM`. */
  month: string
  categoryId: string
  currency: string
  movedIn: number
  movedOut: number
}

/** One month of an envelope run. */
export interface EnvelopeRunMonth {
  /** `YYYY-MM`. */
  month: string
  /** The household's ledger of the month in its main currency. */
  ledger: Ledger
  /** The day whose rate converts the month's assignments and moves. */
  rateDate: string
}

/** The envelopes of the last month of a run. */
export interface EnvelopeMonth {
  /** Each listed category's envelope, a parent's with its children's. */
  envelopes: Map<string, BudgetEnvelope>
  readyToAssign: number | null
  leftOut: string[]
}

interface EnvelopeSums {
  assigned: bigint
  movedIn: bigint
  movedOut: bigint
  spent: bigint
  available: bigint
}

/**
 * The envelopes of the last month of `months`, a run of envelope months oldest first, computed
 * from the ledger and never stored. Each envelope is a category's own: a parent's own spending is
 * its ledger spending less its listed children's. Month by month, an envelope's available is what
 * it had last month, when above zero, plus what was assigned to it, plus moves in, less moves out,
 * less its spending. An overspent envelope shows its negative balance in its month, starts the
 * next one at zero, and the excess comes out of the next month's ready to assign: last month's,
 * plus income, less everything assigned, less last month's overspending. The run's first month
 * starts from zero.
 *
 * Every figure is in `baseCurrency`. An assignment or a move in another currency is converted at
 * its month's `rateDate`; one with no rate is left out and its currency named, never counted at a
 * rate of 1 (R8). A sum past the safe range makes every figure `null`. Integers only.
 */
export async function envelopeMonth(
  input: {
    baseCurrency: string
    categories: readonly BudgetCategory[]
    months: readonly EnvelopeRunMonth[]
    assignments: readonly BudgetAssignment[]
    moves: readonly BudgetMoveTotal[]
  },
  rate: EntryRateLookup,
): Promise<EnvelopeMonth> {
  const { baseCurrency, categories } = input
  const listed = new Set(categories.map((category) => category.id))
  const childrenOf = new Map<string, string[]>()
  for (const category of categories) {
    if (category.parentId !== null && listed.has(category.parentId)) {
      childrenOf.set(category.parentId, [...childrenOf.get(category.parentId) ?? [], category.id])
    }
  }
  const leftOut = new Set<string>()
  let tooLarge = false
  const toBase = async (amount: number, currency: string, rateDate: string): Promise<bigint> => {
    if (!Number.isSafeInteger(amount)) {
      tooLarge = true
      return 0n
    }
    if (currency === baseCurrency) return BigInt(amount)
    const converted = convertMoney(
      amount,
      currency,
      baseCurrency,
      await rate(currency, baseCurrency, rateDate),
    )
    if (converted.ok) return BigInt(converted.value)
    if (converted.error === "unsafe") tooLarge = true
    else leftOut.add(currency)
    return 0n
  }

  let readyToAssign = 0n
  let overspent = 0n
  let carried = new Map<string, bigint>()
  let last = new Map<string, EnvelopeSums>()
  for (const { month, ledger, rateDate } of input.months) {
    if (ledger.tooLarge || ledger.income === null) tooLarge = true
    for (const code of ledger.leftOut) leftOut.add(code)
    const ledgerSpent = new Map(
      ledger.categories.map((entry) => [entry.categoryId, BigInt(entry.spending)]),
    )
    const sums = new Map<string, EnvelopeSums>()
    for (const id of listed) {
      const children = childrenOf.get(id) ?? []
      const spent = children.reduce(
        (sum, child) => sum - (ledgerSpent.get(child) ?? 0n),
        ledgerSpent.get(id) ?? 0n,
      )
      sums.set(id, { assigned: 0n, movedIn: 0n, movedOut: 0n, spent, available: 0n })
    }
    for (const assignment of input.assignments) {
      const sum = assignment.month === month ? sums.get(assignment.categoryId) : undefined
      if (sum) sum.assigned += await toBase(assignment.amount, assignment.currency, rateDate)
    }
    for (const move of input.moves) {
      const sum = move.month === month ? sums.get(move.categoryId) : undefined
      if (!sum) continue
      sum.movedIn += await toBase(move.movedIn, move.currency, rateDate)
      sum.movedOut += await toBase(move.movedOut, move.currency, rateDate)
    }
    let assigned = 0n
    let overspentNow = 0n
    for (const [id, sum] of sums) {
      sum.available = (carried.get(id) ?? 0n) + sum.assigned + sum.movedIn - sum.movedOut -
        sum.spent
      assigned += sum.assigned
      if (sum.available < 0n) overspentNow -= sum.available
    }
    readyToAssign += BigInt(ledger.income ?? 0) - assigned - overspent
    overspent = overspentNow
    carried = new Map([...sums].map(([id, sum]) => [id, sum.available > 0n ? sum.available : 0n]))
    last = sums
  }

  const safe = (value: bigint): number | null =>
    tooLarge || value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)
      ? null
      : Number(value)
  const envelopes = new Map<string, BudgetEnvelope>()
  for (const id of listed) {
    const parts = [id, ...childrenOf.get(id) ?? []].flatMap((part) => last.get(part) ?? [])
    const total = (field: keyof EnvelopeSums) => safe(parts.reduce((sum, p) => sum + p[field], 0n))
    envelopes.set(id, {
      assigned: total("assigned"),
      movedIn: total("movedIn"),
      movedOut: total("movedOut"),
      spent: total("spent"),
      available: total("available"),
    })
  }
  return { envelopes, readyToAssign: safe(readyToAssign), leftOut: [...leftOut].sort() }
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

export interface BudgetMethodSetInput {
  groupId: string
  /** The household's current month, `YYYY-MM`. */
  month: string
  method: BudgetMethod
  expectedVersion: number | null
  requestId?: string
}

export interface BudgetMoveInput {
  id: string
  groupId: string
  month: string
  fromCategoryId: string
  toCategoryId: string
  amount: number
  /** The household's main currency now. */
  currency: string
  requestId?: string
}

/**
 * Where budgets are kept. Each write checks the actor's role again on the locked membership row
 * (`lockActorRole`), checks what it names inside the household under that lock, writes and
 * records one change on the group, in one transaction.
 */
export interface BudgetRepository {
  /**
   * Writes the month's row. Throws the refusals of {@link assertBudgetCategory} and
   * {@link BudgetVersionConflictError}. A new row gets a version 7 id.
   */
  set(input: BudgetSetInput, actorId: number): Promise<Budget>
  /**
   * Writes the household's method row for `input.month` at the version named, an admin or the
   * owner only ({@link assertCanSetBudgetMethod}). Throws {@link BudgetVersionConflictError}.
   */
  setMethod(input: BudgetMethodSetInput, actorId: number): Promise<BudgetMethodSetting>
  /**
   * Stores a move, an editor or above only. Both categories pass {@link assertBudgetCategory} as a
   * new amount would. A retry with the same id and fields returns the stored move and records
   * nothing; the same id with other fields, or another household's, is `ID_ALREADY_EXISTS`.
   */
  move(input: BudgetMoveInput, actorId: number): Promise<BudgetMove>
  /** The household's method rows at or before `month` (`YYYY-MM`), oldest first. */
  methodsUpTo(groupId: string, month: string): Promise<BudgetMethodSetting[]>
  /** The budget rows with an amount whose month is from `from` to `to` (`YYYY-MM`), exactly. */
  assignmentsIn(groupId: string, from: string, to: string): Promise<BudgetAssignment[]>
  /** The moves from `from` to `to` (`YYYY-MM`), summed per month, category and currency. */
  moveTotalsIn(groupId: string, from: string, to: string): Promise<BudgetMoveTotal[]>
  /** Each category's latest row at or before `month` (`YYYY-MM`), rows with no amount included. */
  limitsAt(groupId: string, month: string): Promise<Budget[]>
  /** The household's live expense categories, by name. */
  categories(groupId: string): Promise<BudgetCategory[]>
  /** The household's time zone, the one its months are cut in (R14). */
  timeZoneOf(groupId: string): Promise<string | null>
}
// #endregion Ports
