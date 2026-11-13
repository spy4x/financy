import { type Type, type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import type { Actor } from "@domain/identity"
import {
  canMutateNotes,
  canRead,
  type GroupImportIssue,
  type GroupRole,
  plainEntryProblem,
} from "@domain/groups"
import { accountCurrencyCode, isCoin } from "@domain/money"
import {
  convertMoney,
  type ExchangeRate,
  type Money,
  sumMoney,
} from "@spy4x/platform/universal/money"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { type FieldErrors, fieldErrors } from "@spy4x/validation"

/**
 * Accounts: Financy's first finance aggregate, copied from Seed's notes and tags shape. An account
 * belongs to one household (a group), holds money in one currency, and has a starting balance; its
 * balance is derived by the server, never stored. Every member reads a household's accounts and an
 * editor or above writes them. `docs/aggregates.md` walks through the files.
 */

/** The longest account name, in characters, after trimming. */
export const ACCOUNT_NAME_MAX_LENGTH = 60

/**
 * The most accounts one household holds, archived ones included (deleted ones are not counted). The
 * list is read as one page with no cursor, so the cap bounds that read for every member. It is the
 * same on every plan: it bounds a read, it is not something a plan sells.
 */
export const ACCOUNT_MAX_PER_GROUP = 100

/** How long a deleted account waits to be restored before the worker removes it for good. */
export const ACCOUNT_RESTORE_DAYS = 30

/**
 * The largest starting balance either way, in the currency's smallest unit. The column is `BIGINT`
 * with a `CHECK` on the same bound, so an amount always crosses JSON as an exact number.
 */
export const ACCOUNT_AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/**
 * What kind of place an account is. Only a label for the icon and the list's grouping: it changes
 * no maths, except that a crypto account holds a listed coin (`COINS` in `@domain/money`) and only
 * a crypto account may. A liability's balance is simply negative when money is owed. The numbers
 * are stored, so they never change.
 */
export enum AccountKind {
  CASH = 1,
  BANK = 2,
  CARD = 3,
  SAVINGS = 4,
  ASSET = 5,
  LIABILITY = 6,
  CRYPTO = 7,
}

/** Every kind, in the order the list groups them. */
export const ACCOUNT_KINDS: readonly AccountKind[] = [
  AccountKind.CASH,
  AccountKind.BANK,
  AccountKind.CARD,
  AccountKind.SAVINGS,
  AccountKind.ASSET,
  AccountKind.LIABILITY,
  AccountKind.CRYPTO,
]

/** The outbox event kinds an account change is recorded under, on the group's change log. */
export const ACCOUNT_EVENTS = {
  created: "account.created",
  updated: "account.updated",
  archived: "account.archived",
  unarchived: "account.unarchived",
  defaultSet: "account.default_set",
  defaultCleared: "account.default_cleared",
  deleted: "account.deleted",
  restored: "account.restored",
} as const

export type AccountErrorCode =
  | "ACCOUNT_ARCHIVED"
  | "ACCOUNT_HAS_TRANSACTIONS"
  | "ACCOUNT_HAS_RECURRING_RULES"
  | "ACCOUNT_LIMIT_REACHED"
  | "ACCOUNT_NOT_FOUND"
  | "CURRENCY_KIND_MISMATCH"
  | "CURRENCY_LOCKED"
  | "GROUP_NOT_FOUND"
  | "ID_ALREADY_EXISTS"
  | "INVALID_REQUEST"
  | "ROLE_INSUFFICIENT"
  | "VERSION_CONFLICT"

export class AccountError extends Error {
  constructor(
    public readonly code: AccountErrorCode,
    message: string,
    /** Each failed field's code and rule, when a schema refused the request. */
    public readonly fields?: FieldErrors,
  ) {
    super(message)
    this.name = "AccountError"
  }
}

/**
 * A write named a version the account has moved past. It carries the version the account is at
 * now, so the client can reread it instead of overwriting a change it never saw.
 */
export class AccountVersionConflictError extends AccountError {
  constructor(public readonly currentVersion: number) {
    super("VERSION_CONFLICT", "The account was changed by someone else")
    this.name = "AccountVersionConflictError"
  }
}

/**
 * Throws `ACCOUNT_LIMIT_REACHED` when a household that just gained an account holds more than
 * {@link ACCOUNT_MAX_PER_GROUP}. `count` is counted after the write, in the write's transaction.
 */
export function assertAccountRoom(count: number): void {
  if (count > ACCOUNT_MAX_PER_GROUP) {
    throw new AccountError(
      "ACCOUNT_LIMIT_REACHED",
      `A household can hold at most ${ACCOUNT_MAX_PER_GROUP} accounts`,
    )
  }
}

/**
 * Throws `CURRENCY_KIND_MISMATCH` unless a crypto account holds a listed coin and every other kind
 * holds an ISO 4217 currency. The create and update handlers and the import check it; Postgres
 * checks it again (`accounts_currency_check`).
 */
export function assertKindFitsCurrency(kind: AccountKind, currency: string): void {
  if ((kind === AccountKind.CRYPTO) === isCoin(currency)) return
  throw new AccountError(
    "CURRENCY_KIND_MISMATCH",
    kind === AccountKind.CRYPTO
      ? `A crypto account must hold a listed coin, not ${currency}`
      : `Only a crypto account can hold ${currency}`,
  )
}

/** One account as the API returns it. */
export interface Account {
  id: string
  groupId: string
  name: string
  kind: AccountKind
  /** An ISO 4217 code, or a listed coin's code for a crypto account; never an id. */
  currency: string
  /** In the currency's smallest unit: 1234 is 12.34 USD, 500 is 500 JPY, 1234 is 1.234 BHD. */
  startingBalance: number
  /** `null` while the account is in use; set once it is archived. */
  archivedAt: Date | null
  /** The household's account for quick entry; at most one live account has it. */
  isDefault: boolean
  /** Starts at 1 and grows by one with every change; a change or delete must name it. */
  version: number
  /** The group's change sequence this account was last written at, as a decimal string (BIGINT). */
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: Date
  updatedAt: Date
  /** `null` while live; set while the account waits in the trash. */
  deletedAt: Date | null
}

/**
 * An account in its household's list, with its balance, computed by the server in SQL: the starting
 * balance plus the account's live entries, in the account's currency.
 */
export interface ListedAccount extends Account {
  balance: number
}

// #region Request schemas
const amountField = `${-ACCOUNT_AMOUNT_MAX} <= number.integer <= ${ACCOUNT_AMOUNT_MAX}` as const
const kindField = `1 <= number.integer <= ${ACCOUNT_KINDS.length}` as const
const versionField = { version: "number.integer >= 1" } as const
const accountFields = {
  name: "string",
  kind: kindField,
  currency: accountCurrencyCode,
  startingBalance: amountField,
} as const
const groupIdField = { groupId: UUID_PATTERN } as const
const accountIdField = { id: UUID_PATTERN } as const

/** The `account.create` payload: a client-made id, so a retry cannot create a second account. */
export const accountCreatePayloadSchema = type({
  ...groupIdField,
  ...accountIdField,
  ...accountFields,
  "+": "reject",
})
/** The `account.update` payload: the new fields, and the version edited. */
export const accountUpdatePayloadSchema = type({
  ...groupIdField,
  ...accountIdField,
  ...accountFields,
  ...versionField,
  "+": "reject",
})
/** The `account.archive` payload: `archived: false` brings an archived account back into use. */
export const accountArchivePayloadSchema = type({
  ...groupIdField,
  ...accountIdField,
  ...versionField,
  archived: "boolean",
  "+": "reject",
})
/** The `account.setDefault` payload: `isDefault: false` leaves the household with no default. */
export const accountSetDefaultPayloadSchema = type({
  ...groupIdField,
  ...accountIdField,
  ...versionField,
  isDefault: "boolean",
  "+": "reject",
})
/** The `account.delete` payload: the version the person saw when deleting. */
export const accountDeletePayloadSchema = type({
  ...groupIdField,
  ...accountIdField,
  ...versionField,
  "+": "reject",
})
/**
 * The `account.restore` payload. A deleted account's version is not needed: nothing but a restore
 * changes it, and a second restore finds no deleted account.
 */
export const accountRestorePayloadSchema = type({
  ...groupIdField,
  ...accountIdField,
  "+": "reject",
})
/** The `account.get` payload. */
export const accountGetPayloadSchema = type({ ...groupIdField, ...accountIdField, "+": "reject" })
/** The `account.list` payload: one page, no cursor; `deleted` lists the trash instead. */
export const accountListPayloadSchema = type({
  ...groupIdField,
  "deleted?": "boolean",
  "+": "reject",
})

/**
 * Validates `value` against `schema`, then trims the name and checks its length in characters, so
 * an emoji counts as one. A name with a control or an invisible character is refused, as a tag's.
 * Throws `AccountError("INVALID_REQUEST")`.
 */
export function parseAccountRequest<S extends Type<object>>(schema: S, value: unknown): S["infer"] {
  const result = schema(value)
  if (result instanceof type.errors) {
    throw new AccountError("INVALID_REQUEST", result.summary, fieldErrors(result))
  }
  const parsed = result as S["infer"] & { name?: string }
  if (parsed.name === undefined) return parsed
  const name = parsed.name.trim()
  const length = Array.from(name).length
  if (length < 1 || length > ACCOUNT_NAME_MAX_LENGTH) {
    throw new AccountError(
      "INVALID_REQUEST",
      `Account name must contain 1 to ${ACCOUNT_NAME_MAX_LENGTH} characters`,
      {
        name: length < 1
          ? { code: "required" }
          : { code: "maxLength", values: { rule: ACCOUNT_NAME_MAX_LENGTH } },
      },
    )
  }
  if (hasUnsafeTextCharacters(name)) {
    throw new AccountError(
      "INVALID_REQUEST",
      "Account name must not contain control or invisible characters",
      { name: { code: "unsafeCharacters" } },
    )
  }
  return { ...parsed, name }
}
// #endregion Request schemas

// #region Authorization
/**
 * Throws unless `role` may read the household's accounts. `null` means the actor is not a member,
 * which answers "group not found" so a stranger cannot tell a household exists.
 */
export function assertCanReadAccounts(role: GroupRole | null): void {
  if (role === null || !canRead(role)) throw new AccountError("GROUP_NOT_FOUND", "Group not found")
}

/** Throws unless `role` may create, change, archive, set the default of or delete accounts. */
export function assertCanWriteAccounts(role: GroupRole | null): void {
  assertCanReadAccounts(role)
  if (!canMutateNotes(role!)) {
    throw new AccountError("ROLE_INSUFFICIENT", "Only an editor can change accounts")
  }
}
// #endregion Authorization

// #region Commands and queries
/** What every command carries besides its own fields. */
interface AccountCommandBase {
  actor: Actor
  groupId: string
  id: string
  /** The request this came from, kept on the audit event. */
  requestId?: string
  /** Makes a retry of this command safe; see the idempotency middleware on the command bus. */
  idempotencyKey?: string
}

/** The fields a person types into the editor. */
export interface AccountFields {
  name: string
  kind: AccountKind
  currency: string
  startingBalance: number
}

export interface AccountCreatePayload extends AccountCommandBase, AccountFields {}

export interface AccountWriteResult {
  account: Account
  /** `false` when the same account was already created by an earlier try of the same request. */
  created: boolean
}

export class AccountCreateCommand implements Command<AccountCreatePayload, AccountWriteResult> {
  __resultType?: AccountWriteResult
  /** The household's plan cap on accounts (`maxAccounts`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: AccountCreatePayload) {}
}

export interface AccountUpdatePayload extends AccountCommandBase, AccountFields {
  /** The version the person edited; an account at any other version is not changed. */
  version: number
}

export class AccountUpdateCommand implements Command<AccountUpdatePayload, { account: Account }> {
  __resultType?: { account: Account }
  constructor(public data: AccountUpdatePayload) {}
}

export interface AccountArchivePayload extends AccountCommandBase {
  version: number
  archived: boolean
}

/** Archives an account, or brings it back. Archiving the default account clears the flag. */
export class AccountArchiveCommand implements Command<AccountArchivePayload, { account: Account }> {
  __resultType?: { account: Account }
  constructor(public data: AccountArchivePayload) {}
}

export interface AccountSetDefaultPayload extends AccountCommandBase {
  version: number
  isDefault: boolean
}

/**
 * Makes an account the household's default, taking the flag off the one that had it, or clears it.
 * An archived account cannot be the default.
 */
export class AccountSetDefaultCommand
  implements Command<AccountSetDefaultPayload, { account: Account }> {
  __resultType?: { account: Account }
  constructor(public data: AccountSetDefaultPayload) {}
}

export interface AccountDeletePayload extends AccountCommandBase {
  version: number
}

/** Moves an account to the trash for {@link ACCOUNT_RESTORE_DAYS} days; a default loses its flag. */
export class AccountDeleteCommand implements Command<AccountDeletePayload, { account: Account }> {
  __resultType?: { account: Account }
  constructor(public data: AccountDeletePayload) {}
}

export type AccountRestorePayload = AccountCommandBase

/** Brings a deleted account back; it counts against the household's cap again. */
export class AccountRestoreCommand implements Command<AccountRestorePayload, { account: Account }> {
  __resultType?: { account: Account }
  /** The household's plan cap on accounts (`maxAccounts`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: AccountRestorePayload) {}
}

export interface AccountListPayload {
  actor: Actor
  groupId: string
  /** `true` lists the household's deleted accounts instead of its live ones. */
  deleted?: boolean
}

export class AccountListQuery implements Query<AccountListPayload, { accounts: ListedAccount[] }> {
  __resultType?: { accounts: ListedAccount[] }
  constructor(public data: AccountListPayload) {}
}

export interface AccountGetPayload {
  actor: Actor
  groupId: string
  id: string
}

export class AccountGetQuery implements Query<AccountGetPayload, { account: ListedAccount }> {
  __resultType?: { account: ListedAccount }
  constructor(public data: AccountGetPayload) {}
}
// #endregion Commands and queries

// #region Household total
/** The `account.total` payload: the household whose total is asked for. */
export const accountTotalPayloadSchema = type({ ...groupIdField, "+": "reject" })

/** A currency the total left out for lack of a rate, with how many accounts hold it. */
export interface LeftOutCurrency {
  currency: string
  accounts: number
}

/**
 * The household's total: every live account, archived ones included, converted to the base
 * currency and summed. `amount` is in the base currency's smallest unit. It is `null` when no
 * account could be converted, and when the sum is past `Number.MAX_SAFE_INTEGER` (`tooLarge`):
 * a number that large could no longer be exact, so none is shown rather than a rounded one.
 */
export interface HouseholdTotal {
  amount: number | null
  currency: string
  /** The oldest rate date the total used, `YYYY-MM-DD`; `null` when no account needed a rate. */
  rateDate: string | null
  /** The currencies with no rate, by code, each with its account count. */
  leftOut: LeftOutCurrency[]
  tooLarge: boolean
}

export interface AccountTotalPayload {
  actor: Actor
  groupId: string
}

export class AccountTotalQuery implements Query<AccountTotalPayload, { total: HouseholdTotal }> {
  __resultType?: { total: HouseholdTotal }
  constructor(public data: AccountTotalPayload) {}
}

/**
 * Sums `accounts` in `currency`. Each balance is converted with its currency's rate in `rates` and
 * rounded once to the base currency's smallest unit, half away from zero (`convertMoney`); then the
 * integers are added. An account whose currency has no rate (missing from `rates`, or `null`) is
 * left out and named, never counted as 0 or at a rate of 1. A conversion past the safe bound makes
 * the whole total `tooLarge`, as a sum past it does.
 */
export function householdTotal(
  accounts: readonly { currency: string; balance: number }[],
  currency: string,
  rates: ReadonlyMap<string, ExchangeRate | null>,
): HouseholdTotal {
  const converted: Money[] = []
  const leftOut = new Map<string, number>()
  let rateDate: string | null = null
  let tooLarge = false
  for (const account of accounts) {
    const rate = account.currency === currency ? null : rates.get(account.currency) ?? null
    const result = convertMoney(account.balance, account.currency, currency, rate)
    if (result.ok) {
      converted.push({ amount: result.value, currency })
      if (rate && (rateDate === null || rate.date < rateDate)) rateDate = rate.date
    } else if (result.error === `unsafe`) {
      tooLarge = true
    } else {
      leftOut.set(account.currency, (leftOut.get(account.currency) ?? 0) + 1)
    }
  }
  const sum = sumMoney(converted, currency)
  if (!sum.ok) tooLarge = true
  return {
    amount: tooLarge || !sum.ok || converted.length === 0 ? null : sum.value,
    currency,
    rateDate,
    leftOut: [...leftOut].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({
      currency: code,
      accounts: count,
    })),
    tooLarge,
  }
}
// #endregion Household total

// #region Ports
interface AccountInputBase {
  groupId: string
  id: string
  requestId?: string
}

/**
 * The household's plan cap on accounts, as the entitlement gate read it; `null` is no cap. The
 * write counts again under the household's lock, so two requests cannot both take the last slot.
 */
interface AccountAllowance {
  allowance: number | null
}

export interface AccountCreateInput extends AccountInputBase, AccountFields, AccountAllowance {}

export interface AccountUpdateInput extends AccountInputBase, AccountFields {
  expectedVersion: number
}

export interface AccountArchiveInput extends AccountInputBase {
  expectedVersion: number
  archived: boolean
}

export interface AccountSetDefaultInput extends AccountInputBase {
  expectedVersion: number
  isDefault: boolean
}

export interface AccountDeleteInput extends AccountInputBase {
  expectedVersion: number
}

export interface AccountRestoreInput extends AccountInputBase, AccountAllowance {}

/**
 * Where accounts are kept. Every write checks the actor's role again on the locked membership row
 * (`lockActorRole`) and records a change on the group in its own transaction (the group's
 * sequence, an outbox row and an audit event). Every id is looked up inside its group, so an
 * account of another household is `ACCOUNT_NOT_FOUND`, the same as one that does not exist.
 */
export interface AccountRepository {
  /**
   * The household's live accounts, archived ones included, by name; with `deleted` the trash. Each
   * balance counts the entries dated on or before `on`, by default today in the household's zone.
   */
  list(groupId: string, deleted?: boolean, on?: string): Promise<ListedAccount[]>
  /** A live account of the group, with its balance on `on`; `null` for a deleted or another's. */
  get(groupId: string, id: string, on?: string): Promise<ListedAccount | null>
  /**
   * Throws `ID_ALREADY_EXISTS` when the id holds a different account, `ACCOUNT_LIMIT_REACHED`
   * when the household is full, and a `PlanError` when its plan's `allowance` is used up. A retry
   * of a create that landed is answered with its account.
   */
  create(input: AccountCreateInput, actorId: number): Promise<AccountWriteResult>
  /** Throws `ACCOUNT_NOT_FOUND` or {@link AccountVersionConflictError}. */
  update(input: AccountUpdateInput, actorId: number): Promise<Account>
  /** Throws `ACCOUNT_NOT_FOUND` or {@link AccountVersionConflictError}. */
  archive(input: AccountArchiveInput, actorId: number): Promise<Account>
  /**
   * Throws `ACCOUNT_NOT_FOUND`, `ACCOUNT_ARCHIVED` for an archived account made the default, or
   * {@link AccountVersionConflictError}.
   */
  setDefault(input: AccountSetDefaultInput, actorId: number): Promise<Account>
  /** Throws `ACCOUNT_NOT_FOUND` or {@link AccountVersionConflictError}. */
  delete(input: AccountDeleteInput, actorId: number): Promise<Account>
  /**
   * Throws `ACCOUNT_NOT_FOUND` for an account that is not deleted, `ACCOUNT_LIMIT_REACHED`, or a
   * `PlanError` when the plan's `allowance` is used up.
   */
  restore(input: AccountRestoreInput, actorId: number): Promise<Account>
}
// #endregion Ports

// #region Export file
/**
 * One account in a household's export file: what a person typed, and whether it was archived or
 * the default. Never a balance, which is derived, a person, a version or a deleted account.
 */
export const accountExportEntrySchema = type({
  id: UUID_PATTERN,
  ...accountFields,
  archived: "boolean",
  isDefault: "boolean",
  createdAt: "string.date.iso.parse",
  updatedAt: "string.date.iso.parse",
  "+": "reject",
})
export type AccountExportEntry = typeof accountExportEntrySchema.infer

/** What a refusal calls each field of an account in a file. */
const ACCOUNT_EXPORT_LABELS = {
  id: "id",
  name: "name",
  kind: "kind",
  currency: "currency",
  startingBalance: "starting balance",
  archived: "archived flag",
  isDefault: "default flag",
  createdAt: "creation date",
  updatedAt: "last change date",
}

/** Checks one account of a file with the rules of a create. Throws `AccountError`. */
export function parseAccountExportEntry(entry: unknown): AccountExportEntry {
  const shape = accountExportEntrySchema(entry)
  if (shape instanceof type.errors) {
    throw new AccountError(
      "INVALID_REQUEST",
      plainEntryProblem(shape, "account", ACCOUNT_EXPORT_LABELS),
      fieldErrors(shape),
    )
  }
  const parsed = parseAccountRequest(accountExportEntrySchema, entry) as AccountExportEntry
  assertKindFitsCurrency(parsed.kind, parsed.currency)
  return parsed
}

/**
 * What is wrong across a file's accounts: more than {@link ACCOUNT_MAX_PER_GROUP} (index `null`),
 * and a second default account, or a default that is archived, by index.
 */
export function accountExportProblems(
  accounts: readonly Pick<AccountExportEntry, "isDefault" | "archived">[],
): { index: number | null; problem: string; issue: GroupImportIssue }[] {
  const problems: { index: number | null; problem: string; issue: GroupImportIssue }[] = []
  if (accounts.length > ACCOUNT_MAX_PER_GROUP) {
    problems.push({
      index: null,
      problem:
        `the file holds ${accounts.length} accounts, and a household holds at most ${ACCOUNT_MAX_PER_GROUP}`,
      issue: {
        code: "tooManyAccounts",
        values: { count: accounts.length, max: ACCOUNT_MAX_PER_GROUP },
      },
    })
  }
  let defaults = 0
  accounts.forEach((account, index) => {
    if (!account.isDefault) return
    if (account.archived) {
      problems.push({
        index,
        problem: `an archived account cannot be the default`,
        issue: { code: "archivedDefaultAccount" },
      })
    }
    defaults += 1
    if (defaults > 1) {
      problems.push({
        index,
        problem: `another account in the file is already the default`,
        issue: { code: "secondDefaultAccount" },
      })
    }
  })
  return problems
}
// #endregion Export file

// #region Admin
/** How many households the operator's accounts page lists, the ones with the most accounts. */
export const ADMIN_ACCOUNTS_HOUSEHOLD_LIMIT = 20

/**
 * What the operator's accounts page shows: counts, kinds and currency codes of live accounts.
 * Never an account's name or an amount (product.md §5): a household's money is not the operator's.
 */
export interface AdminAccountsOverview {
  /** Live accounts, archived ones included; deleted ones are left out. */
  accounts: number
  /** Households with at least one live account. */
  households: number
  /** One row per kind in use, in {@link ACCOUNT_KINDS} order. */
  byKind: { kind: AccountKind; accounts: number }[]
  /** One row per currency code in use, most accounts first. */
  byCurrency: { currency: string; accounts: number }[]
  /** The households with the most accounts, at most {@link ADMIN_ACCOUNTS_HOUSEHOLD_LIMIT}. */
  topHouseholds: { groupId: string; groupName: string; accounts: number; currencies: string[] }[]
}
// #endregion Admin
