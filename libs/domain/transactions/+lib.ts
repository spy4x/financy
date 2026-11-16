import { type Type, type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import { IMPORT_FILE_MAX_BYTES, type ImportKindLimits } from "@domain/imports"
import type { Actor } from "@domain/identity"
import {
  canMutateNotes,
  canRead,
  type GroupImportIssue,
  type GroupRole,
  plainEntryProblem,
  type WidgetDefinition,
} from "@domain/groups"
import { CategoryKind } from "@domain/categories"
import { accountCurrencyCode, convertAmount } from "@domain/money"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { isValidTimeZone } from "@spy4x/time/tz"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { endOfMonth, parseIsoDate, shiftMonth, startOfMonth } from "@spy4x/time/date"
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

/** How many deleted entries the deleted list shows at most, the latest deleted first. */
export const TRANSACTION_DELETED_LIST_MAX = 200

/** The longest bank reference an entry keeps, in characters (`transactions.bank_reference`). */
export const TRANSACTION_BANK_REFERENCE_MAX_LENGTH = 255

/**
 * The bank statement import kind's limits: OFX and QFX, QIF, CAMT.053, MT940 and a CSV a built-in
 * profile reads, at most 5 MiB and 5,000 rows, the most a check reviews. The server's kind
 * (`libs/server/transactions/statement-import.ts`) and the import page both read them.
 */
export const BANK_STATEMENT_IMPORT_KIND: ImportKindLimits = {
  id: `bank-statement`,
  accept: [`.csv`, `.ofx`, `.qfx`, `.qif`, `.xml`, `.sta`, `.mt940`, `.txt`],
  maxBytes: 5 * 1024 * 1024,
  maxRows: 5_000,
}

/**
 * The app history import kind's limits: Firefly III's transactions CSV, YNAB's export (the zip or
 * its register CSV) and Actual Budget's export zip, at most the generic 5 MiB and 50,000 rows. A
 * check reviews only the first 5,000 (`IMPORT_REVIEW_ROWS_MAX`); a save reviews every row. The
 * server's kind is `libs/server/transactions/history-import.ts`.
 */
export const APP_HISTORY_IMPORT_KIND: ImportKindLimits = {
  id: `app-history`,
  accept: [`.csv`, `.zip`],
  maxBytes: IMPORT_FILE_MAX_BYTES,
  maxRows: 50_000,
}

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
 * an ISO 4217 code or a listed coin, as an account's may be. A repeating rule's entry template
 * (`@domain/recurring`) takes the same fields.
 */
export const entryFields = {
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
/** The `transaction.listDeleted` payload: the household whose deleted entries are listed. */
export const transactionListDeletedPayloadSchema = type({ ...groupIdField, "+": "reject" })
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
 * Whether a category of `category` may hold an entry of `kind` (R7): an expense needs an expense
 * category; an income takes an income category, or an expense one as a refund.
 */
export function categoryFitsKind(kind: TransactionKind, category: CategoryKind): boolean {
  return kind === TransactionKind.INCOME || category === CategoryKind.EXPENSE
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
  if (!categoryFitsKind(kind, references.category.kind)) {
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

export interface TransactionListDeletedPayload {
  actor: Actor
  groupId: string
}

/**
 * The household's deleted entries that can still be restored, the latest deleted first, at most
 * {@link TRANSACTION_DELETED_LIST_MAX}.
 */
export class TransactionListDeletedQuery
  implements Query<TransactionListDeletedPayload, { transactions: Transaction[] }> {
  __resultType?: { transactions: Transaction[] }
  constructor(public data: TransactionListDeletedPayload) {}
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
   * refunds, a parent's including its children's (R13). Most spending first. `converted` when any
   * of its rows counted, a child's included, needed a rate.
   */
  categories: { categoryId: string; spending: number; converted: boolean }[]
  /** The currencies left out for lack of a rate, by code (R8): both lists below, together. */
  leftOut: string[]
  /** The currencies whose income entries were left out for lack of a rate, by code. */
  incomeLeftOut: string[]
  /** The currencies whose expenses or refunds were left out for lack of a rate, by code. */
  spendingLeftOut: string[]
  /**
   * The newest date of a rate the sums used (R6), or `null` when every counted entry was in
   * `currency` and nothing needed a rate.
   */
  rateDate: string | null
  /** {@link rateDate} of the income entries alone: whether income is converted, and how lately. */
  incomeRateDate: string | null
  /** {@link rateDate} of the expenses and refunds alone. */
  spendingRateDate: string | null
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
  const incomeLeftOut = new Set<string>()
  const spendingLeftOut = new Set<string>()
  let incomeRateDate: string | null = null
  let spendingRateDate: string | null = null
  let tooLarge = false
  let income = 0n
  const spentByCategory = new Map<string, bigint>()
  const convertedCategories = new Set<string>()
  for (const row of rows) {
    const category = byId.get(row.categoryId)
    if (!category) continue
    const rate = row.currency === currency ? null : await rateOf(row.currency, row.date)
    const result = Number.isSafeInteger(row.amount)
      ? convertAmount(row.amount, row.currency, currency, rate)
      : { ok: false as const, error: "unsafe" as const }
    const isIncome = category.kind === CategoryKind.INCOME
    if (!result.ok) {
      if (result.error === "unsafe") tooLarge = true
      else (isIncome ? incomeLeftOut : spendingLeftOut).add(row.currency)
      continue
    }
    if (isIncome) {
      incomeRateDate = newer(incomeRateDate, rate?.date ?? null)
      income += BigInt(result.value)
      continue
    }
    spendingRateDate = newer(spendingRateDate, rate?.date ?? null)
    const spent = -BigInt(result.value)
    for (const id of new Set([category.id, category.parentId ?? category.id])) {
      spentByCategory.set(id, (spentByCategory.get(id) ?? 0n) + spent)
      if (rate) convertedCategories.add(id)
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
      .map(({ categoryId, spent }) => ({
        categoryId,
        spending: Number(spent),
        converted: convertedCategories.has(categoryId),
      })),
    leftOut: [...new Set([...incomeLeftOut, ...spendingLeftOut])].sort(),
    incomeLeftOut: [...incomeLeftOut].sort(),
    spendingLeftOut: [...spendingLeftOut].sort(),
    rateDate: newer(incomeRateDate, spendingRateDate),
    incomeRateDate,
    spendingRateDate,
    tooLarge,
  }
}

/** The later of two calendar days, either of which may be missing. */
function newer(a: string | null, b: string | null): string | null {
  return a === null || (b !== null && b > a) ? b : a
}

/**
 * Sums `rows` into one {@link Ledger} per calendar month, from the month of `period.from` to the
 * month of `period.to`, oldest first. Each month reads exactly as {@link summarizeLedger} reads it
 * alone, so one database read of a run of months serves every month in it.
 */
export async function summarizeLedgerMonths(
  rows: readonly LedgerRow[],
  categories: readonly LedgerCategory[],
  period: { currency: string; from: string; to: string },
  lookupRate: EntryRateLookup,
): Promise<Ledger[]> {
  const byMonth = new Map<string, LedgerRow[]>()
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    byMonth.set(month, [...byMonth.get(month) ?? [], row])
  }
  const ledgers: Ledger[] = []
  for (let first = startOfMonth(period.from);; first = shiftMonth(first, 1)) {
    const last = endOfMonth(first)
    ledgers.push(
      await summarizeLedger(
        byMonth.get(first.slice(0, 7)) ?? [],
        categories,
        { currency: period.currency, from: first, to: last },
        lookupRate,
      ),
    )
    if (last >= period.to) return ledgers
  }
}
// #endregion Ledger

// #region Overview widgets
/*
 * The money widgets on the household overview: Net, Income and Spending for the range, each with
 * the period of the same length before it, and "Where did the money go?", the range's spending by
 * category with no comparison. Every member sees them, as every member reads the
 * entries. They show the household's own figures, so the operator's group page draws none of them
 * (`operatorView: "never"`, product.md §5).
 */

/** The money widgets' ids. A saved layout keeps them: never rename one. */
export const MONEY_WIDGET_IDS = {
  net: "money.net",
  income: "money.income",
  spending: "money.spending",
  categories: "money.categories",
} as const

/**
 * The one query operation the three money widgets share: each reads the same two ledgers and draws
 * its own figure from them, so no widget sums on its own.
 */
export const MONEY_WIDGET_OPERATION = "transaction.widget.ledger"

/** The money widgets, in their default order: Net is the answer, Income and Spending explain it. */
export const MONEY_WIDGETS: readonly WidgetDefinition[] = [
  moneyWidget(MONEY_WIDGET_IDS.net, "MoneyWidgets.netTitle"),
  moneyWidget(MONEY_WIDGET_IDS.income, "MoneyWidgets.incomeTitle"),
  moneyWidget(MONEY_WIDGET_IDS.spending, "MoneyWidgets.spendingTitle"),
]

function moneyWidget(id: string, titleKey: string): WidgetDefinition {
  return {
    id,
    titleKey,
    size: "stat",
    canView: canRead,
    operation: MONEY_WIDGET_OPERATION,
    operatorView: "never",
  }
}

/** A ledger as a money widget gets it: its sums, without the categories it does not draw. */
export type LedgerFigures = Omit<Ledger, "categories">

/**
 * A money widget's answer: the range's ledger, and the ledger of the period before it. `previous`
 * is `null` when the household has no entry dated on or before that period's first day, so a
 * comparison would set the range against a period it had not started recording.
 */
export interface MoneyWidgetResult {
  current: LedgerFigures
  previous: LedgerFigures | null
}

/** The money widget payload: the overview's widget payload, as every widget gets it. */
export const transactionWidgetPayloadSchema = type({
  groupId: UUID_PATTERN,
  from: calendarDate,
  to: calendarDate,
  timeZone: "string <= 64",
  "+": "reject",
})

/** What the money widget query carries. */
export interface TransactionWidgetPayload {
  actor: Actor
  groupId: string
  from: string
  to: string
  /**
   * The zone the page cut "today" in, the household's. Checked and otherwise unused: an entry's
   * own calendar date decides its day (R14), so the sums do not depend on it.
   */
  timeZone: string
}

/**
 * A money widget payload as the handler needs it. Throws `TransactionError("INVALID_REQUEST")` for
 * a payload that fails the schema, a range that does not run forward or is longer than a year, and
 * a zone the runtime does not know.
 */
export function parseTransactionWidgetRequest(
  value: unknown,
): Omit<TransactionWidgetPayload, "actor"> {
  const request = parseTransactionRequest(transactionWidgetPayloadSchema, value)
  if (!isValidTimeZone(request.timeZone)) {
    throw new TransactionError("INVALID_REQUEST", "The time zone is unknown", {
      timeZone: { code: "timeZone" },
    })
  }
  return request
}

/** Net, Income and Spending: the range's ledger and the previous period's. */
export class TransactionWidgetQuery implements Query<TransactionWidgetPayload, MoneyWidgetResult> {
  __resultType?: MoneyWidgetResult
  constructor(public data: TransactionWidgetPayload) {}
}

/** The query operation of "Where did the money go?": the range's ledger, by category. */
export const CATEGORY_WIDGET_OPERATION = "transaction.widget.categories"

/** How many categories "Where did the money go?" names before "and N more". */
export const CATEGORY_WIDGET_TOP = 5

/**
 * "Where did the money go?", full width: a ranked row per category. It comes after the budgets
 * widget, so it has its own list.
 */
export const CATEGORY_WIDGETS: readonly WidgetDefinition[] = [{
  id: MONEY_WIDGET_IDS.categories,
  titleKey: "MoneyWidgets.categoriesTitle",
  size: "full",
  canView: canRead,
  operation: CATEGORY_WIDGET_OPERATION,
  operatorView: "never",
}]

/** One row of "Where did the money go?": a top-level category and its spending. */
export interface CategoryWidgetRow {
  categoryId: string
  name: string
  /** Above zero: its spending with its children's, refunds taken off, as the ledger reads it. */
  spending: number
  /** Whether any of its rows, a child's included, needed a rate. */
  converted: boolean
}

/**
 * "Where did the money go?" for the range: the ledger's top-level categories that spent, most
 * first, and their sum.
 */
export interface CategoryWidgetResult {
  currency: string
  /**
   * The shares' denominator: the spending of every top-level category that spent, listed or in
   * `more`. A net-refunded category is not in it, so it can be above the ledger's `spending`.
   * `null` only when `tooLarge`.
   */
  total: number | null
  /** Whether any spending in {@link total} needed a rate. */
  converted: boolean
  /** At most {@link CATEGORY_WIDGET_TOP} rows, in the ledger's order. */
  top: CategoryWidgetRow[]
  /** How many more top-level categories spent in the range. */
  more: number
  spendingLeftOut: string[]
  spendingRateDate: string | null
  tooLarge: boolean
}

/**
 * The ledger's categories as "Where did the money go?" lists them: top-level ones only, since a
 * parent's figure already holds its children's and shares must not count twice, and only those
 * that spent. Names come from `categories`, the household's own, archived ones included; a
 * category it lacks is not listed.
 */
export function categoryWidgetResult(
  ledger: Ledger,
  categories: readonly { id: string; name: string; parentId: string | null }[],
): CategoryWidgetResult {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const listed = ledger.categories.flatMap(({ categoryId, spending, converted }) => {
    const category = byId.get(categoryId)
    return category && category.parentId === null && spending > 0
      ? [{ categoryId, name: category.name, spending, converted }]
      : []
  })
  const sum = listed.reduce((total, row) => total + BigInt(row.spending), 0n)
  const tooLarge = ledger.tooLarge || sum > BigInt(Number.MAX_SAFE_INTEGER)
  return {
    currency: ledger.currency,
    total: tooLarge ? null : Number(sum),
    converted: listed.some((row) => row.converted),
    top: listed.slice(0, CATEGORY_WIDGET_TOP),
    more: Math.max(listed.length - CATEGORY_WIDGET_TOP, 0),
    spendingLeftOut: ledger.spendingLeftOut,
    spendingRateDate: ledger.spendingRateDate,
    tooLarge,
  }
}

/** "Where did the money go?": the range's ledger by top-level category, named. */
export class TransactionCategoryWidgetQuery
  implements Query<TransactionWidgetPayload, CategoryWidgetResult> {
  __resultType?: CategoryWidgetResult
  constructor(public data: TransactionWidgetPayload) {}
}
// #endregion Overview widgets

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
  /**
   * The household's deleted entries, the latest deleted first, at most `limit`. The worker purges
   * an entry {@link TRANSACTION_RESTORE_DAYS} days after its delete, so every one listed can be
   * restored.
   */
  listDeleted(groupId: string, limit: number): Promise<Transaction[]>
  /** How many live entries the household holds; the plan's `maxTransactions` adds transfers. */
  count(groupId: string): Promise<number>
  /** The household's time zone, the one its days are cut in (R14). */
  timeZoneOf(groupId: string): Promise<string | null>
  /** The date of the household's oldest live entry, or `null` when it has none. */
  firstDate(groupId: string): Promise<string | null>
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
  /**
   * One {@link Ledger} per calendar month from `from` to `to` (the first and the last day of whole
   * months), in `currency`, from one read: {@link summarizeLedgerMonths}.
   */
  ledgerMonths(groupId: string, currency: string, from: string, to: string): Promise<Ledger[]>
}
// #endregion Ports

// #region Export file
/** A stored amount: a whole number of the smallest unit, signed by the kind, never zero (R5). */
const signedAmount =
  `${-TRANSACTION_AMOUNT_MAX} <= number.integer <= ${TRANSACTION_AMOUNT_MAX}` as const

/**
 * One entry in a household's export file: what the server stored, both amounts and the conversion
 * flag included, so an import keeps them as they were and never converts again (R4). Its account
 * and category are named by their ids in the same file. Never a person, a version or a deleted
 * entry.
 */
export const transactionExportEntrySchema = type({
  id: UUID_PATTERN,
  accountId: UUID_PATTERN,
  categoryId: UUID_PATTERN,
  kind: `1 <= number.integer <= 2`,
  accountAmount: signedAmount,
  amount: signedAmount,
  currency: accountCurrencyCode,
  converted: `boolean`,
  memo: `string`,
  date: calendarDate,
  createdAt: `string.date.iso.parse`,
  updatedAt: `string.date.iso.parse`,
  "+": `reject`,
})
export type TransactionExportEntry = typeof transactionExportEntrySchema.infer

/** What a refusal calls each field of an entry in a file. */
const TRANSACTION_EXPORT_LABELS = {
  id: `id`,
  accountId: `account`,
  categoryId: `category`,
  kind: `kind`,
  accountAmount: `account amount`,
  amount: `amount`,
  currency: `currency`,
  converted: `converted flag`,
  memo: `memo`,
  date: `date`,
  createdAt: `creation date`,
  updatedAt: `last change date`,
}

/**
 * Checks one entry of a file with the rules of a write: the memo's, and both amounts signed by the
 * kind, an expense below zero and an income above (R5). Throws `TransactionError`.
 */
export function parseTransactionExportEntry(entry: unknown): TransactionExportEntry {
  const shape = transactionExportEntrySchema(entry)
  if (shape instanceof type.errors) {
    throw new TransactionError(
      `INVALID_REQUEST`,
      plainEntryProblem(shape, `entry`, TRANSACTION_EXPORT_LABELS),
      fieldErrors(shape),
    )
  }
  const parsed = parseTransactionRequest(
    transactionExportEntrySchema,
    entry,
  ) as TransactionExportEntry
  const sign = parsed.kind === TransactionKind.EXPENSE ? -1 : 1
  for (const field of [`amount`, `accountAmount`] as const) {
    if (Math.sign(parsed[field]) !== sign) {
      throw new TransactionError(
        `INVALID_REQUEST`,
        `the ${TRANSACTION_EXPORT_LABELS[field]} of ${
          sign < 0 ? `an expense must be below` : `an income must be above`
        } zero`,
        { [field]: { code: `sign` } },
      )
    }
  }
  return parsed
}

/** What an entry of a file points at, by its id in the file; `null` when the file has none. */
export interface EntryFileReferences {
  account(fileId: string): { currency: string } | null
  category(fileId: string): { kind: CategoryKind } | null
}

/**
 * What is wrong between a file's entries and the accounts and categories it holds, by index: an
 * account or a category the file lacks, an expense in an income category (R12, as
 * {@link assertEntryReferences} refuses it), and an entry in its account's own currency whose two
 * amounts differ or that claims a conversion.
 */
export function transactionReferenceProblems(
  entries: readonly Pick<
    TransactionExportEntry,
    `accountId` | `categoryId` | `kind` | `amount` | `accountAmount` | `currency` | `converted`
  >[],
  references: EntryFileReferences,
): { index: number; problem: string; issue: GroupImportIssue }[] {
  const problems: { index: number; problem: string; issue: GroupImportIssue }[] = []
  entries.forEach((entry, index) => {
    const found = {
      account: references.account(entry.accountId),
      category: references.category(entry.categoryId),
    }
    try {
      assertEntryReferences(entry.kind, found)
    } catch (error) {
      if (!(error instanceof TransactionError)) throw error
      const [field, { code }] = Object.entries(error.fields ?? {})[0]
      problems.push({ index, problem: messageOfReference(error.code), issue: { code, field } })
      return
    }
    const sameCurrency = entry.currency === found.account!.currency
    if (sameCurrency && (entry.amount !== entry.accountAmount || entry.converted)) {
      problems.push({
        index,
        problem: `in the account's own currency, the account amount is the amount, unconverted`,
        issue: { code: `mismatch`, field: `accountAmount` },
      })
    }
  })
  return problems
}

/** A file's words for a refusal of {@link assertEntryReferences}. */
function messageOfReference(code: TransactionErrorCode): string {
  if (code === `ACCOUNT_NOT_FOUND`) return `its account is not among the file's accounts`
  if (code === `CATEGORY_NOT_FOUND`) return `its category is not among the file's categories`
  return `an expense needs an expense category`
}
// #endregion Export file

// #region Admin
/** How many calendar months the operator's entries page counts, the current one last. */
export const ADMIN_ENTRIES_MONTHS = 6

/** How many households the operator's entries page lists, the busiest in those months. */
export const ADMIN_ENTRIES_HOUSEHOLD_LIMIT = 20

/** One calendar month of {@link AdminEntriesOverview}, by the entries' own date. */
export interface AdminEntriesMonth {
  /** `YYYY-MM`. */
  month: string
  entries: number
  /** Households with at least one entry in the month. */
  households: number
}

/** One household of {@link AdminEntriesOverview}: its counts and its last entry's day. */
export interface AdminEntriesHousehold {
  groupId: string
  groupName: string
  /** Every live entry the household has, whatever its date. */
  entries: number
  /** Entries per month, aligned to {@link AdminEntriesOverview.months}. */
  months: number[]
  /** `YYYY-MM-DD`, the latest date among its live entries. */
  lastEntryDate: string
}

/**
 * What the operator's entries page shows: counts and dates only. Never an amount, a currency, a
 * memo, an account, a category or a person: they say what a household spends and on what. Deleted
 * entries count nowhere.
 */
export interface AdminEntriesOverview {
  /** Live entries across every household. */
  entries: number
  /** Households with at least one live entry. */
  households: number
  /** `YYYY-MM-DD`, the latest date among live entries, or `null` when there are none. */
  lastEntryDate: string | null
  /** The last {@link ADMIN_ENTRIES_MONTHS} calendar months in UTC, oldest first, each present. */
  months: AdminEntriesMonth[]
  /**
   * At most {@link ADMIN_ENTRIES_HOUSEHOLD_LIMIT} households: the most entries in those months
   * first, then the most entries overall, then by id.
   */
  topHouseholds: AdminEntriesHousehold[]
}
// #endregion Admin
