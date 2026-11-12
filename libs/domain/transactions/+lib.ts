import { type Type, type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import type { Actor } from "@domain/identity"
import { canMutateNotes, canRead, type GroupRole } from "@domain/groups"
import { CategoryKind } from "@domain/categories"
import { accountCurrencyCode, amountDecimals } from "@domain/money"
import { convertMoney, type ExchangeRate } from "@spy4x/platform/universal/money"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { parseIsoDate } from "@spy4x/time/date"
import { type FieldErrors, fieldErrors } from "@spy4x/validation"

/**
 * Transactions: a household's income and expense entries, copied from the accounts aggregate. An
 * entry belongs to one household (a group), moves money in one of its accounts and is sorted by one
 * of its categories. It keeps what was paid (`amount` in `currency`) next to what moved in the
 * account (`accountAmount` in the account's currency), so a later rate never rewrites it (R4).
 * Every member reads a household's entries and an editor or above writes them.
 * `docs/aggregates.md` walks through the files.
 */

/** The longest memo, in characters, after trimming. */
export const TRANSACTION_MEMO_MAX_LENGTH = 500

/** How long a deleted entry waits to be restored before the worker removes it for good. */
export const TRANSACTION_RESTORE_DAYS = 30

/**
 * The largest amount of one entry, in the currency's smallest unit. The columns are `BIGINT` with
 * a `CHECK` on the same bound, so an amount always crosses JSON as an exact number (R1, R3).
 */
export const TRANSACTION_AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/** The longest period the ledger reads at once, in days: a year, a leap year included. */
export const LEDGER_MAX_DAYS = 366

/** Which way money moved. The numbers are stored, so they never change; transfers come later. */
export enum TransactionKind {
  EXPENSE = 1,
  INCOME = 2,
}

/** The outbox event kinds an entry change is recorded under, on the group's change log. */
export const TRANSACTION_EVENTS = {
  created: "transaction.created",
  updated: "transaction.updated",
  deleted: "transaction.deleted",
  restored: "transaction.restored",
} as const

export type TransactionErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "CATEGORY_KIND_MISMATCH"
  | "CATEGORY_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "ID_ALREADY_EXISTS"
  | "INVALID_REQUEST"
  | "NO_RATE"
  | "ROLE_INSUFFICIENT"
  | "TRANSACTION_NOT_FOUND"
  | "VERSION_CONFLICT"

export class TransactionError extends Error {
  constructor(
    public readonly code: TransactionErrorCode,
    message: string,
    /** Each failed field's code and rule, when a schema or a rule refused the request. */
    public readonly fields?: FieldErrors,
  ) {
    super(message)
    this.name = "TransactionError"
  }
}

/**
 * A write named a version the entry has moved past. It carries the version the entry is at now,
 * so the client can reread it instead of overwriting a change it never saw.
 */
export class TransactionVersionConflictError extends TransactionError {
  constructor(public readonly currentVersion: number) {
    super("VERSION_CONFLICT", "The entry was changed by someone else")
    this.name = "TransactionVersionConflictError"
  }
}

/** One entry as the API returns it. */
export interface Transaction {
  id: string
  groupId: string
  accountId: string
  categoryId: string
  kind: TransactionKind
  /**
   * What moved in the account, in the account's currency's smallest unit: negative for an expense,
   * positive for an income (R5).
   */
  accountAmount: number
  /** What was paid, in `currency`'s smallest unit, with the same sign as `accountAmount`. */
  amount: number
  /** The currency paid in, an ISO 4217 code or a listed coin; the account's own if not converted. */
  currency: string
  /**
   * `true` when the server filled `accountAmount` from the rate of the entry's date; `false` when
   * the person stated it (a manual rate) or both currencies are the same.
   */
  converted: boolean
  memo: string
  /** The calendar date the money moved, `YYYY-MM-DD`, in the household's time zone (R14). */
  date: string
  /** Starts at 1 and grows by one with every change; a change or delete must name it. */
  version: number
  /** The group's change sequence this entry was last written at, as a decimal string (BIGINT). */
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: Date
  updatedAt: Date
  /** `null` while live; set while the entry waits in the trash. */
  deletedAt: Date | null
}

// #region Request schemas
/** A request amount: a whole number of the smallest unit above zero; the server sets the sign. */
const positiveAmount = `1 <= number.integer <= ${TRANSACTION_AMOUNT_MAX}` as const
/** A `YYYY-MM-DD` date the calendar has: `2026-02-30` is refused, not rolled into March. */
export const calendarDate: Type<string> = type(`string`).narrow((value, ctx) => {
  try {
    parseIsoDate(value)
    return true
  } catch {
    return ctx.mustBe(`a calendar date like 2026-11-30`)
  }
})
const versionField = { version: "number.integer >= 1" } as const
const groupIdField = { groupId: UUID_PATTERN } as const
const idField = { id: UUID_PATTERN } as const
/**
 * What a person types into an entry: never its sign, group, author or conversion flag (R18).
 * `accountAmount` is stated only for a manual rate; left out, the server converts. The currency is
 * an ISO 4217 code or a listed coin, as an account's may be.
 */
const entryFields = {
  accountId: UUID_PATTERN,
  categoryId: UUID_PATTERN,
  kind: `1 <= number.integer <= 2`,
  amount: positiveAmount,
  currency: accountCurrencyCode,
  "accountAmount?": positiveAmount,
} as const

/**
 * The `transaction.create` payload: a client-made id, so a retry cannot add a second entry. No
 * memo is an empty one, and no date is today in the household's time zone.
 */
export const transactionCreatePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...entryFields,
  "memo?": "string",
  "date?": calendarDate,
  "+": "reject",
})
/**
 * The `transaction.update` payload: every field again, and the version edited. The memo and the
 * date are required, so an edit that names neither cannot move the entry to today, convert it
 * again at today's rate or clear its memo.
 */
export const transactionUpdatePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...entryFields,
  memo: "string",
  date: calendarDate,
  ...versionField,
  "+": "reject",
})
/** The `transaction.delete` payload: the version the person saw when deleting. */
export const transactionDeletePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...versionField,
  "+": "reject",
})
/** The `transaction.restore` payload: nothing but a restore changes a deleted entry. */
export const transactionRestorePayloadSchema = type({ ...groupIdField, ...idField, "+": "reject" })
/** The `transaction.get` payload. */
export const transactionGetPayloadSchema = type({ ...groupIdField, ...idField, "+": "reject" })
/** The `transaction.ledger` payload: a period of whole days, both ends included. */
export const transactionLedgerPayloadSchema = type({
  ...groupIdField,
  from: calendarDate,
  to: calendarDate,
  "+": "reject",
})

/**
 * Validates `value` against `schema`, then trims the memo and checks its length in characters, so
 * an emoji counts as one, and refuses a memo with a control or an invisible character. A ledger
 * period that ends before it starts or is longer than {@link LEDGER_MAX_DAYS} is refused too.
 * Throws `TransactionError("INVALID_REQUEST")`.
 */
export function parseTransactionRequest<S extends Type<object>>(
  schema: S,
  value: unknown,
): S["infer"] {
  const result = schema(value)
  if (result instanceof type.errors) {
    throw new TransactionError("INVALID_REQUEST", result.summary, fieldErrors(result))
  }
  const parsed = result as S["infer"] & { memo?: string; from?: string; to?: string }
  if (parsed.from !== undefined && parsed.to !== undefined) {
    const days = (parseIsoDate(parsed.to) - parseIsoDate(parsed.from)) / 86_400_000 + 1
    if (days < 1 || days > LEDGER_MAX_DAYS) {
      throw new TransactionError(
        "INVALID_REQUEST",
        `A period runs forward and spans at most ${LEDGER_MAX_DAYS} days`,
        { to: { code: "after", values: { rule: parsed.from } } },
      )
    }
  }
  if (parsed.memo === undefined) return parsed
  const memo = parsed.memo.trim()
  if (Array.from(memo).length > TRANSACTION_MEMO_MAX_LENGTH) {
    throw new TransactionError(
      "INVALID_REQUEST",
      `A memo holds at most ${TRANSACTION_MEMO_MAX_LENGTH} characters`,
      { memo: { code: "maxLength", values: { rule: TRANSACTION_MEMO_MAX_LENGTH } } },
    )
  }
  // A line break is the one control character a memo may hold: a person types it on purpose.
  if (hasUnsafeTextCharacters(memo.replaceAll("\n", " "))) {
    throw new TransactionError(
      "INVALID_REQUEST",
      "A memo must not contain control or invisible characters",
      { memo: { code: "unsafeCharacters" } },
    )
  }
  return { ...parsed, memo }
}
// #endregion Request schemas

// #region Authorization
/**
 * Throws unless `role` may read the household's entries. `null` means the actor is not a member,
 * which answers "group not found" so a stranger cannot tell a household exists.
 */
export function assertCanReadTransactions(role: GroupRole | null): void {
  if (role === null || !canRead(role)) {
    throw new TransactionError("GROUP_NOT_FOUND", "Group not found")
  }
}

/** Throws unless `role` may add, change, delete or restore entries (R16). */
export function assertCanWriteTransactions(role: GroupRole | null): void {
  assertCanReadTransactions(role)
  if (!canMutateNotes(role!)) {
    throw new TransactionError("ROLE_INSUFFICIENT", "Only an editor can change entries")
  }
}
// #endregion Authorization

// #region Server-derived fields
/** The fields a person types into an entry, as a command carries them after parsing. */
export interface TransactionFields {
  accountId: string
  categoryId: string
  kind: TransactionKind
  /** What was paid, above zero; the server sets the sign (R5). */
  amount: number
  currency: string
  /** What moved in the account, above zero, for a manual rate; left out, the server converts. */
  accountAmount?: number
  memo: string
  date: string
}

/** What a write reads about the entry's account and category, inside the household. */
export interface EntryReferences {
  /** The household's live account the entry names; `null` for another household's or a deleted one. */
  account: { currency: string } | null
  /** The household's category the entry names, archived ones included; `null` for another's. */
  category: { kind: CategoryKind } | null
}

/** What the server stores for an entry besides what the person typed (R18). */
export interface DerivedAmounts {
  accountAmount: number
  amount: number
  converted: boolean
}

/** The rate from `base` to `quote` on `date` or the latest earlier day; `null` for none. */
export type EntryRateLookup = (
  base: string,
  quote: string,
  date: string,
) => Promise<ExchangeRate | null>

/**
 * `convertMoney` with each side's decimals from `amountDecimals`, so a coin is scaled by its own 8
 * decimals and not by `Intl`'s guess of 2, which would put 0.5 BTC a million times off.
 */
function convertAmount(
  amount: number,
  from: string,
  to: string,
  rate: ExchangeRate | null,
): ReturnType<typeof convertMoney> {
  return convertMoney(amount, from, to, rate, {
    fromDecimals: amountDecimals(from),
    toDecimals: amountDecimals(to),
  })
}

/**
 * Checks what an entry points at (R12, R17): another household's account or category answers
 * `ACCOUNT_NOT_FOUND` or `CATEGORY_NOT_FOUND`, the same as an id that does not exist. An expense
 * takes an expense category; an income takes an income category, or an expense category as a
 * refund. Archived accounts and categories are accepted, so an old entry stays editable.
 */
export function assertEntryReferences(
  kind: TransactionKind,
  references: EntryReferences,
): asserts references is { account: { currency: string }; category: { kind: CategoryKind } } {
  if (references.account === null) {
    throw new TransactionError("ACCOUNT_NOT_FOUND", "Account not found", {
      accountId: { code: "notFound" },
    })
  }
  if (references.category === null) {
    throw new TransactionError("CATEGORY_NOT_FOUND", "Category not found", {
      categoryId: { code: "notFound" },
    })
  }
  if (kind === TransactionKind.EXPENSE && references.category.kind !== CategoryKind.EXPENSE) {
    throw new TransactionError("CATEGORY_KIND_MISMATCH", "An expense needs an expense category", {
      categoryId: { code: "kindMismatch" },
    })
  }
}

/**
 * The amounts the server stores (R4, R5, R18). The sign follows the kind, whatever was sent.
 *
 * - Both currencies the same: the account amount is the amount; a different stated account amount
 *   is refused.
 * - An account amount stated: a manual rate, stored as stated, not converted.
 * - None stated, and `previous` is the same entry with the same account, amount, currency and
 *   date: the stored account amount is kept, so an edit of the memo never reruns a rate (R4).
 * - Otherwise the amount is converted with the rate of the entry's date (R6) and marked
 *   converted; no rate answers `NO_RATE`, so the form asks for the account amount.
 */
export async function deriveAmounts(
  fields: TransactionFields,
  accountCurrency: string,
  previous:
    | Pick<
      Transaction,
      "accountId" | "amount" | "currency" | "date" | "accountAmount" | "converted"
    >
    | null,
  lookupRate: EntryRateLookup,
): Promise<DerivedAmounts> {
  const sign = fields.kind === TransactionKind.EXPENSE ? -1 : 1
  const amount = sign * fields.amount
  if (fields.currency === accountCurrency) {
    if (fields.accountAmount !== undefined && fields.accountAmount !== fields.amount) {
      throw new TransactionError(
        "INVALID_REQUEST",
        "In the account's own currency, the account amount is the amount",
        { accountAmount: { code: "mismatch" } },
      )
    }
    return { accountAmount: amount, amount, converted: false }
  }
  if (fields.accountAmount !== undefined) {
    return { accountAmount: sign * fields.accountAmount, amount, converted: false }
  }
  if (
    previous !== null && previous.accountId === fields.accountId &&
    Math.abs(previous.amount) === fields.amount && previous.currency === fields.currency &&
    previous.date === fields.date
  ) {
    return {
      accountAmount: sign * Math.abs(previous.accountAmount),
      amount,
      converted: previous.converted,
    }
  }
  const rate = await lookupRate(fields.currency, accountCurrency, fields.date)
  const result = convertAmount(fields.amount, fields.currency, accountCurrency, rate)
  if (!result.ok && result.error === "unsafe") {
    throw new TransactionError("INVALID_REQUEST", "The converted amount is too large", {
      amount: { code: "tooLarge" },
    })
  }
  if (result.ok && result.value === 0) {
    throw new TransactionError("INVALID_REQUEST", "The converted amount rounds to zero", {
      accountAmount: { code: "required" },
    })
  }
  if (!result.ok) {
    throw new TransactionError(
      "NO_RATE",
      `No rate from ${fields.currency} to ${accountCurrency} on or before ${fields.date}`,
      { accountAmount: { code: "required" } },
    )
  }
  return { accountAmount: sign * result.value, amount, converted: true }
}
// #endregion Server-derived fields

// #region Commands and queries
/** What every command carries besides its own fields. */
interface TransactionCommandBase {
  actor: Actor
  groupId: string
  id: string
  /** The request this came from. */
  requestId?: string
  /** Makes a retry of this command safe; see the idempotency middleware on the command bus. */
  idempotencyKey?: string
}

/** A create or an update as parsed: the date may still be left for the server to fill. */
export interface TransactionRequestFields extends Omit<TransactionFields, "date" | "memo"> {
  memo?: string
  date?: string
}

export interface TransactionCreatePayload
  extends TransactionCommandBase, TransactionRequestFields {}

export interface TransactionWriteResult {
  transaction: Transaction
  /** `false` when the same entry was already created by an earlier try of the same request. */
  created: boolean
}

export class TransactionCreateCommand
  implements Command<TransactionCreatePayload, TransactionWriteResult> {
  __resultType?: TransactionWriteResult
  /** The household's plan cap on entries (`maxTransactions`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: TransactionCreatePayload) {}
}

export interface TransactionUpdatePayload extends TransactionCommandBase, TransactionFields {
  /** The version the person edited; an entry at any other version is not changed. */
  version: number
}

export class TransactionUpdateCommand
  implements Command<TransactionUpdatePayload, { transaction: Transaction }> {
  __resultType?: { transaction: Transaction }
  constructor(public data: TransactionUpdatePayload) {}
}

export interface TransactionDeletePayload extends TransactionCommandBase {
  version: number
}

/** Moves an entry to the trash for {@link TRANSACTION_RESTORE_DAYS} days. */
export class TransactionDeleteCommand
  implements Command<TransactionDeletePayload, { transaction: Transaction }> {
  __resultType?: { transaction: Transaction }
  constructor(public data: TransactionDeletePayload) {}
}

export type TransactionRestorePayload = TransactionCommandBase

/** Brings a deleted entry back; it counts against the household's plan again. */
export class TransactionRestoreCommand
  implements Command<TransactionRestorePayload, { transaction: Transaction }> {
  __resultType?: { transaction: Transaction }
  /** The household's plan cap on entries (`maxTransactions`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: TransactionRestorePayload) {}
}

export interface TransactionGetPayload {
  actor: Actor
  groupId: string
  id: string
}

export class TransactionGetQuery
  implements Query<TransactionGetPayload, { transaction: Transaction }> {
  __resultType?: { transaction: Transaction }
  constructor(public data: TransactionGetPayload) {}
}

export interface TransactionLedgerPayload {
  actor: Actor
  groupId: string
  from: string
  to: string
}

export class TransactionLedgerQuery implements Query<TransactionLedgerPayload, { ledger: Ledger }> {
  __resultType?: { ledger: Ledger }
  constructor(public data: TransactionLedgerPayload) {}
}
// #endregion Commands and queries

// #region Ledger
/**
 * A period's money for a household, in its base currency's smallest unit (legacy §4 item 2): what
 * came in, what went out per category, and the difference. Amounts are `null` only when a sum is
 * past `Number.MAX_SAFE_INTEGER` (`tooLarge`), since a number that large could no longer be exact.
 */
export interface Ledger {
  currency: string
  from: string
  to: string
  /** Income entries in income categories. A refund is not income. */
  income: number | null
  /** Expenses less refunds, in every expense category. */
  spending: number | null
  /** `income - spending`. */
  net: number | null
  /**
   * Each expense category with entries in the period, with its spending: its own entries less its
   * refunds, a parent's including its children's (R13). Most spending first.
   */
  categories: { categoryId: string; spending: number }[]
  /** The currencies left out for lack of a rate, by code (R8). */
  leftOut: string[]
  tooLarge: boolean
}

/**
 * The live entries of one category on one day in one currency, summed: what the ledger converts.
 * `amount` is signed, as stored.
 */
export interface LedgerRow {
  categoryId: string
  currency: string
  date: string
  amount: number
}

/** A category as the ledger sorts it: its kind and its parent. */
export interface LedgerCategory {
  id: string
  kind: CategoryKind
  parentId: string | null
}

/**
 * Sums `rows` into a {@link Ledger} in `currency`. Each row is converted with the rate of its date
 * (R6), rounded once to the base currency's smallest unit (`convertMoney`), and the integers are
 * added. Rows of one day, category and currency share one rate, so they come summed and are
 * converted once. A row in a currency with no rate that day is left out and its currency named,
 * never counted as 0 or at a rate of 1 (R8).
 *
 * An income row in an income category is income. Any row in an expense category is spending: an
 * expense adds to it, and an income there is a refund that lowers it and does not grow income.
 */
export async function summarizeLedger(
  rows: readonly LedgerRow[],
  categories: readonly LedgerCategory[],
  period: { currency: string; from: string; to: string },
  lookupRate: EntryRateLookup,
): Promise<Ledger> {
  const { currency } = period
  const byId = new Map(categories.map((category) => [category.id, category]))
  const rates = new Map<string, Promise<ExchangeRate | null>>()
  const rateOf = (code: string, date: string) => {
    const key = `${code}:${date}`
    if (!rates.has(key)) rates.set(key, lookupRate(code, currency, date))
    return rates.get(key)!
  }
  const leftOut = new Set<string>()
  let tooLarge = false
  let income = 0n
  const spentByCategory = new Map<string, bigint>()
  for (const row of rows) {
    const category = byId.get(row.categoryId)
    if (!category) continue
    const rate = row.currency === currency ? null : await rateOf(row.currency, row.date)
    const result = Number.isSafeInteger(row.amount)
      ? convertAmount(row.amount, row.currency, currency, rate)
      : { ok: false as const, error: "unsafe" as const }
    if (!result.ok) {
      if (result.error === "unsafe") tooLarge = true
      else leftOut.add(row.currency)
      continue
    }
    if (category.kind === CategoryKind.INCOME) {
      income += BigInt(result.value)
      continue
    }
    const spent = -BigInt(result.value)
    for (const id of new Set([category.id, category.parentId ?? category.id])) {
      spentByCategory.set(id, (spentByCategory.get(id) ?? 0n) + spent)
    }
  }
  const topLevel = [...spentByCategory].filter(([id]) => byId.get(id)?.parentId === null)
  const spending = topLevel.reduce((sum, [, spent]) => sum + spent, 0n)
  const net = income - spending
  const listed = [...spentByCategory].map(([categoryId, spent]) => ({ categoryId, spent }))
  const limit = BigInt(Number.MAX_SAFE_INTEGER)
  if (
    [income, spending, net, ...listed.map((entry) => entry.spent)].some((v) =>
      v > limit || v < -limit
    )
  ) {
    tooLarge = true
  }
  return {
    currency,
    from: period.from,
    to: period.to,
    income: tooLarge ? null : Number(income),
    spending: tooLarge ? null : Number(spending),
    net: tooLarge ? null : Number(net),
    categories: tooLarge ? [] : listed
      .sort((
        a,
        b,
      ) => (a.spent === b.spent
        ? a.categoryId.localeCompare(b.categoryId)
        : a.spent > b.spent
        ? -1
        : 1)
      )
      .map(({ categoryId, spent }) => ({ categoryId, spending: Number(spent) })),
    leftOut: [...leftOut].sort(),
    tooLarge,
  }
}
// #endregion Ledger

// #region Ports
interface TransactionInputBase {
  groupId: string
  id: string
  requestId?: string
}

/**
 * The household's plan cap on entries, as the entitlement gate read it; `null` is no cap. The write
 * counts again under the household's lock, so two requests cannot both take the last slot.
 */
interface TransactionAllowance {
  allowance: number | null
}

export interface TransactionCreateInput
  extends TransactionInputBase, TransactionFields, TransactionAllowance {}

export interface TransactionUpdateInput extends TransactionInputBase, TransactionFields {
  expectedVersion: number
}

export interface TransactionDeleteInput extends TransactionInputBase {
  expectedVersion: number
}

export interface TransactionRestoreInput extends TransactionInputBase, TransactionAllowance {}

/**
 * Where entries are kept. Every write checks the actor's role again on the locked membership row
 * (`lockActorRole`), reads the account and category inside the household under that lock, derives
 * the stored amounts ({@link deriveAmounts}) and records one change on the group in its own
 * transaction. Every id is looked up inside its group, so another household's entry is
 * `TRANSACTION_NOT_FOUND`, the same as one that does not exist.
 */
export interface TransactionRepository {
  /** A live entry of the group; `null` for a deleted one or another group's. */
  get(groupId: string, id: string): Promise<Transaction | null>
  /** How many live entries the household holds: what the plan's `maxTransactions` counts. */
  count(groupId: string): Promise<number>
  /** The household's time zone, the one its days are cut in (R14). */
  timeZoneOf(groupId: string): Promise<string | null>
  /**
   * Throws `ID_ALREADY_EXISTS` when the id holds a different entry, the refusals of
   * {@link assertEntryReferences} and {@link deriveAmounts}, and a `PlanError` when the plan's
   * `allowance` is used up. A retry of a create that landed is answered with its entry.
   */
  create(input: TransactionCreateInput, actorId: number): Promise<TransactionWriteResult>
  /** Throws `TRANSACTION_NOT_FOUND`, {@link TransactionVersionConflictError} or a create's refusals. */
  update(input: TransactionUpdateInput, actorId: number): Promise<Transaction>
  /** Throws `TRANSACTION_NOT_FOUND` or {@link TransactionVersionConflictError}. */
  delete(input: TransactionDeleteInput, actorId: number): Promise<Transaction>
  /** Throws `TRANSACTION_NOT_FOUND` for an entry that is not deleted, or a `PlanError`. */
  restore(input: TransactionRestoreInput, actorId: number): Promise<Transaction>
  /** The household's {@link Ledger} for `from` to `to`, both included, in `currency`. */
  ledger(groupId: string, currency: string, from: string, to: string): Promise<Ledger>
}
// #endregion Ports
