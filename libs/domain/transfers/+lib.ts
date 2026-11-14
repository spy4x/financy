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
import { convertAmount } from "@domain/money"
import { calendarDate, type EntryRateLookup } from "@domain/transactions"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { type FieldErrors, fieldErrors } from "@spy4x/validation"

/**
 * Transfers: money a household moves between two of its own accounts, copied from the entries
 * aggregate (`@domain/transactions`). A transfer is one record with two sides (product.md): the
 * from account loses the sent amount, in its currency, and the to account gains the received
 * amount, in its own (R5). Across currencies both amounts are kept, so the rate the bank really
 * charged stays on record; the implied rate is never stored. A transfer has no category and counts
 * in no income or spending figure (R12). Every member reads a household's transfers and an editor
 * or above writes them. `docs/aggregates.md` walks through the files.
 */

/** The longest memo, in characters, after trimming. */
export const TRANSFER_MEMO_MAX_LENGTH = 500

/** How long a deleted transfer waits to be restored before the worker removes it for good. */
export const TRANSFER_RESTORE_DAYS = 30

/**
 * The largest amount of one side, in its currency's smallest unit. The columns are `BIGINT` with a
 * `CHECK` on the same bound, so an amount always crosses JSON as an exact number (R1, R3).
 */
export const TRANSFER_AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/** The outbox event kinds a transfer change is recorded under, on the group's change log. */
export const TRANSFER_EVENTS = {
  created: "transfer.created",
  updated: "transfer.updated",
  deleted: "transfer.deleted",
  restored: "transfer.restored",
} as const

export type TransferErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "ID_ALREADY_EXISTS"
  | "INVALID_REQUEST"
  | "NO_RATE"
  | "ROLE_INSUFFICIENT"
  | "TRANSFER_NOT_FOUND"
  | "TRANSFER_SAME_ACCOUNT"
  | "VERSION_CONFLICT"

export class TransferError extends Error {
  constructor(
    public readonly code: TransferErrorCode,
    message: string,
    /** Each failed field's code and rule, when a schema or a rule refused the request. */
    public readonly fields?: FieldErrors,
  ) {
    super(message)
    this.name = "TransferError"
  }
}

/**
 * A write named a version the transfer has moved past. It carries the version the transfer is at
 * now, so the client can reread it instead of overwriting a change it never saw.
 */
export class TransferVersionConflictError extends TransferError {
  constructor(public readonly currentVersion: number) {
    super("VERSION_CONFLICT", "The transfer was changed by someone else")
    this.name = "TransferVersionConflictError"
  }
}

/** One transfer as the API returns it. */
export interface Transfer {
  id: string
  groupId: string
  fromAccountId: string
  /** What left the from account, above zero, in its currency's smallest unit. */
  sentAmount: number
  toAccountId: string
  /** What arrived in the to account, above zero, in its currency's smallest unit. */
  receivedAmount: number
  /**
   * `true` when the server filled `receivedAmount` from the rate of the transfer's date; `false`
   * when the person stated it or both accounts hold the same currency.
   */
  converted: boolean
  memo: string
  /** The calendar date the money moved, `YYYY-MM-DD`, in the household's time zone (R14). */
  date: string
  /** Starts at 1 and grows by one with every change; a change or delete must name it. */
  version: number
  /** The group's change sequence this transfer was last written at, as a decimal string. */
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: Date
  updatedAt: Date
  /** `null` while live; set while the transfer waits in the trash. */
  deletedAt: Date | null
}

// #region Request schemas
const positiveAmount = `1 <= number.integer <= ${TRANSFER_AMOUNT_MAX}` as const
const versionField = { version: "number.integer >= 1" } as const
const groupIdField = { groupId: UUID_PATTERN } as const
const idField = { id: UUID_PATTERN } as const
/**
 * What a person types into a transfer: never its group, author or conversion flag (R18), and no
 * category, since a transfer has none (R12). `receivedAmount` is stated for the rate the bank
 * charged; left out across currencies, the server converts.
 */
const transferFields = {
  fromAccountId: UUID_PATTERN,
  toAccountId: UUID_PATTERN,
  sentAmount: positiveAmount,
  "receivedAmount?": positiveAmount,
} as const

/**
 * The `transfer.create` payload: a client-made id, so a retry cannot add a second transfer. No
 * memo is an empty one, and no date is today in the household's time zone.
 */
export const transferCreatePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...transferFields,
  "memo?": "string",
  "date?": calendarDate,
  "+": "reject",
})
/**
 * The `transfer.update` payload: every field again, and the version edited. The memo and the date
 * are required, so an edit that names neither cannot move the transfer to today or clear its memo.
 */
export const transferUpdatePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...transferFields,
  memo: "string",
  date: calendarDate,
  ...versionField,
  "+": "reject",
})
/** The `transfer.delete` payload: the version the person saw when deleting. */
export const transferDeletePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...versionField,
  "+": "reject",
})
/** The `transfer.restore` payload: nothing but a restore changes a deleted transfer. */
export const transferRestorePayloadSchema = type({ ...groupIdField, ...idField, "+": "reject" })
/** The `transfer.get` payload. */
export const transferGetPayloadSchema = type({ ...groupIdField, ...idField, "+": "reject" })

/**
 * Validates `value` against `schema`, then trims the memo and checks its length in characters, so
 * an emoji counts as one, and refuses a memo with a control or an invisible character. Throws
 * `TransferError("INVALID_REQUEST")`.
 */
export function parseTransferRequest<S extends Type<object>>(
  schema: S,
  value: unknown,
): S["infer"] {
  const result = schema(value)
  if (result instanceof type.errors) {
    throw new TransferError("INVALID_REQUEST", result.summary, fieldErrors(result))
  }
  const parsed = result as S["infer"] & { memo?: string }
  if (parsed.memo === undefined) return parsed
  const memo = parsed.memo.trim()
  if (Array.from(memo).length > TRANSFER_MEMO_MAX_LENGTH) {
    throw new TransferError(
      "INVALID_REQUEST",
      `A memo holds at most ${TRANSFER_MEMO_MAX_LENGTH} characters`,
      { memo: { code: "maxLength", values: { rule: TRANSFER_MEMO_MAX_LENGTH } } },
    )
  }
  // A line break is the one control character a memo may hold: a person types it on purpose.
  if (hasUnsafeTextCharacters(memo.replaceAll("\n", " "))) {
    throw new TransferError(
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
 * Throws unless `role` may read the household's transfers. `null` means the actor is not a member,
 * which answers "group not found" so a stranger cannot tell a household exists.
 */
export function assertCanReadTransfers(role: GroupRole | null): void {
  if (role === null || !canRead(role)) {
    throw new TransferError("GROUP_NOT_FOUND", "Group not found")
  }
}

/** Throws unless `role` may add, change, delete or restore transfers (R16). */
export function assertCanWriteTransfers(role: GroupRole | null): void {
  assertCanReadTransfers(role)
  if (!canMutateNotes(role!)) {
    throw new TransferError("ROLE_INSUFFICIENT", "Only an editor can change transfers")
  }
}
// #endregion Authorization

// #region Server-derived fields
/** The fields a person types into a transfer, as a command carries them after parsing. */
export interface TransferFields {
  fromAccountId: string
  toAccountId: string
  /** What left the from account, above zero. */
  sentAmount: number
  /** What arrived, above zero, for a stated rate; left out, the server sets it. */
  receivedAmount?: number
  memo: string
  date: string
}

/** What a write reads about the transfer's two accounts, inside the household. */
export interface TransferReferences {
  /** The household's live account the money left; `null` for another household's or a deleted one. */
  from: { currency: string } | null
  /** The household's live account the money reached; `null` for another household's or a deleted one. */
  to: { currency: string } | null
}

/** What the server stores for a transfer besides what the person typed (R18). */
export interface DerivedTransferAmounts {
  sentAmount: number
  receivedAmount: number
  converted: boolean
}

/**
 * Checks what a transfer points at (R17): the two accounts differ, and another household's
 * account or a deleted one answers `ACCOUNT_NOT_FOUND`, the same as an id that does not exist.
 * An archived account is accepted, as entries accept one, so an old transfer stays editable.
 */
export function assertTransferReferences(
  fields: Pick<TransferFields, "fromAccountId" | "toAccountId">,
  references: TransferReferences,
): asserts references is { from: { currency: string }; to: { currency: string } } {
  if (fields.fromAccountId === fields.toAccountId) {
    throw new TransferError(
      "TRANSFER_SAME_ACCOUNT",
      "A transfer moves money between two accounts",
      {
        toAccountId: { code: "sameAccount" },
      },
    )
  }
  if (references.from === null) {
    throw new TransferError("ACCOUNT_NOT_FOUND", "Account not found", {
      fromAccountId: { code: "notFound" },
    })
  }
  if (references.to === null) {
    throw new TransferError("ACCOUNT_NOT_FOUND", "Account not found", {
      toAccountId: { code: "notFound" },
    })
  }
}

/**
 * Refuses a received amount that differs from the sent one between two accounts of one currency,
 * so the household's total cannot drift (R5). Left out, the received amount is the sent one.
 */
export function assertOneCurrencyAmounts(sentAmount: number, receivedAmount?: number): void {
  if (receivedAmount !== undefined && receivedAmount !== sentAmount) {
    throw new TransferError(
      "INVALID_REQUEST",
      "In one currency, the received amount is the sent amount",
      { receivedAmount: { code: "mismatch" } },
    )
  }
}

/**
 * The amounts the server stores (R4, R5, R6, R18).
 *
 * - Both accounts in one currency: what arrived is what was sent; a different stated received
 *   amount is refused, so the household's total cannot drift.
 * - A received amount stated: the rate the bank charged, stored as stated, not converted.
 * - None stated, and `previous` is the same transfer with the same accounts, sent amount and date:
 *   the stored received amount is kept, so an edit of the memo never reruns a rate.
 * - Otherwise the sent amount is converted at the rate of the transfer's date, never today's (R6),
 *   and marked converted; no rate answers `NO_RATE`, so the form asks for the received amount.
 *   So doubling the sent dollars of a USD to JPY transfer recomputes the yen at that date's rate,
 *   and never stores the dollars as yen (legacy §4 item 6).
 */
export async function deriveTransferAmounts(
  fields: TransferFields,
  fromCurrency: string,
  toCurrency: string,
  previous:
    | Pick<
      Transfer,
      "fromAccountId" | "toAccountId" | "sentAmount" | "date" | "receivedAmount" | "converted"
    >
    | null,
  lookupRate: EntryRateLookup,
): Promise<DerivedTransferAmounts> {
  const sentAmount = fields.sentAmount
  if (fromCurrency === toCurrency) {
    assertOneCurrencyAmounts(sentAmount, fields.receivedAmount)
    return { sentAmount, receivedAmount: sentAmount, converted: false }
  }
  if (fields.receivedAmount !== undefined) {
    return { sentAmount, receivedAmount: fields.receivedAmount, converted: false }
  }
  if (
    previous !== null && previous.fromAccountId === fields.fromAccountId &&
    previous.toAccountId === fields.toAccountId && previous.sentAmount === sentAmount &&
    previous.date === fields.date
  ) {
    return { sentAmount, receivedAmount: previous.receivedAmount, converted: previous.converted }
  }
  const rate = await lookupRate(fromCurrency, toCurrency, fields.date)
  const result = convertAmount(sentAmount, fromCurrency, toCurrency, rate)
  if (!result.ok && result.error === "unsafe") {
    throw new TransferError("INVALID_REQUEST", "The received amount is too large", {
      sentAmount: { code: "tooLarge" },
    })
  }
  if (result.ok && result.value === 0) {
    throw new TransferError("INVALID_REQUEST", "The received amount rounds to zero", {
      receivedAmount: { code: "required" },
    })
  }
  if (!result.ok) {
    throw new TransferError(
      "NO_RATE",
      `No rate from ${fromCurrency} to ${toCurrency} on or before ${fields.date}`,
      { receivedAmount: { code: "required" } },
    )
  }
  return { sentAmount, receivedAmount: result.value, converted: true }
}
// #endregion Server-derived fields

// #region Commands and queries
/** What every command carries besides its own fields. */
interface TransferCommandBase {
  actor: Actor
  groupId: string
  id: string
  /** The request this came from. */
  requestId?: string
  /** Makes a retry of this command safe; see the idempotency middleware on the command bus. */
  idempotencyKey?: string
}

/** A create as parsed: the memo and the date may still be left for the server to fill. */
export interface TransferRequestFields extends Omit<TransferFields, "date" | "memo"> {
  memo?: string
  date?: string
}

export interface TransferCreatePayload extends TransferCommandBase, TransferRequestFields {}

export interface TransferWriteResult {
  transfer: Transfer
  /** `false` when the same transfer was already created by an earlier try of the same request. */
  created: boolean
}

export class TransferCreateCommand implements Command<TransferCreatePayload, TransferWriteResult> {
  __resultType?: TransferWriteResult
  /**
   * The household's plan cap (`maxTransactions`, which counts entries and transfers together), set
   * by the entitlement gate.
   */
  allowance?: number | null
  constructor(public data: TransferCreatePayload) {}
}

export interface TransferUpdatePayload extends TransferCommandBase, TransferFields {
  /** The version the person edited; a transfer at any other version is not changed. */
  version: number
}

export class TransferUpdateCommand
  implements Command<TransferUpdatePayload, { transfer: Transfer }> {
  __resultType?: { transfer: Transfer }
  constructor(public data: TransferUpdatePayload) {}
}

export interface TransferDeletePayload extends TransferCommandBase {
  version: number
}

/** Moves a transfer to the trash for {@link TRANSFER_RESTORE_DAYS} days. */
export class TransferDeleteCommand
  implements Command<TransferDeletePayload, { transfer: Transfer }> {
  __resultType?: { transfer: Transfer }
  constructor(public data: TransferDeletePayload) {}
}

export type TransferRestorePayload = TransferCommandBase

/** Brings a deleted transfer back; it counts against the household's plan again. */
export class TransferRestoreCommand
  implements Command<TransferRestorePayload, { transfer: Transfer }> {
  __resultType?: { transfer: Transfer }
  /** The household's plan cap (`maxTransactions`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: TransferRestorePayload) {}
}

export interface TransferGetPayload {
  actor: Actor
  groupId: string
  id: string
}

export class TransferGetQuery implements Query<TransferGetPayload, { transfer: Transfer }> {
  __resultType?: { transfer: Transfer }
  constructor(public data: TransferGetPayload) {}
}
// #endregion Commands and queries

// #region Ports
interface TransferInputBase {
  groupId: string
  id: string
  requestId?: string
}

/**
 * The household's plan cap on entries and transfers together, as the entitlement gate read it;
 * `null` is no cap. The write counts again under the household's lock, so two requests cannot
 * both take the last slot.
 */
interface TransferAllowance {
  allowance: number | null
}

export interface TransferCreateInput extends TransferInputBase, TransferFields, TransferAllowance {}

export interface TransferUpdateInput extends TransferInputBase, TransferFields {
  expectedVersion: number
}

export interface TransferDeleteInput extends TransferInputBase {
  expectedVersion: number
}

export interface TransferRestoreInput extends TransferInputBase, TransferAllowance {}

/**
 * Where transfers are kept. Every write checks the actor's role again on the locked membership row
 * (`lockActorRole`), reads both accounts inside the household under that lock, derives the stored
 * amounts ({@link deriveTransferAmounts}) and records one change on the group in its own
 * transaction. Every id is looked up inside its group, so another household's transfer is
 * `TRANSFER_NOT_FOUND`, the same as one that does not exist.
 */
export interface TransferRepository {
  /** A live transfer of the group; `null` for a deleted one or another group's. */
  get(groupId: string, id: string): Promise<Transfer | null>
  /** How many live transfers the household holds. */
  count(groupId: string): Promise<number>
  /** The household's time zone, the one its days are cut in (R14). */
  timeZoneOf(groupId: string): Promise<string | null>
  /**
   * Throws `ID_ALREADY_EXISTS` when the id holds a different transfer, the refusals of
   * {@link assertTransferReferences} and {@link deriveTransferAmounts}, and a `PlanError` when the
   * plan's `allowance` is used up. A retry of a create that landed is answered with its transfer.
   */
  create(input: TransferCreateInput, actorId: number): Promise<TransferWriteResult>
  /** Throws `TRANSFER_NOT_FOUND`, {@link TransferVersionConflictError} or a create's refusals. */
  update(input: TransferUpdateInput, actorId: number): Promise<Transfer>
  /** Throws `TRANSFER_NOT_FOUND` or {@link TransferVersionConflictError}. */
  delete(input: TransferDeleteInput, actorId: number): Promise<Transfer>
  /** Throws `TRANSFER_NOT_FOUND` for a transfer that is not deleted, or a `PlanError`. */
  restore(input: TransferRestoreInput, actorId: number): Promise<Transfer>
}
// #endregion Ports

// #region Export file
/**
 * One transfer in a household's export file: what the server stored, both amounts and the
 * conversion flag included, so an import keeps them as they were and never converts again (R4).
 * Its two accounts are named by their ids in the same file. Never a person, a version or a deleted
 * transfer.
 */
export const transferExportEntrySchema = type({
  id: UUID_PATTERN,
  fromAccountId: UUID_PATTERN,
  toAccountId: UUID_PATTERN,
  sentAmount: positiveAmount,
  receivedAmount: positiveAmount,
  converted: `boolean`,
  memo: `string`,
  date: calendarDate,
  createdAt: `string.date.iso.parse`,
  updatedAt: `string.date.iso.parse`,
  "+": `reject`,
})
export type TransferExportEntry = typeof transferExportEntrySchema.infer

/** What a refusal calls each field of a transfer in a file. */
const TRANSFER_EXPORT_LABELS = {
  id: `id`,
  fromAccountId: `from account`,
  toAccountId: `to account`,
  sentAmount: `sent amount`,
  receivedAmount: `received amount`,
  converted: `converted flag`,
  memo: `memo`,
  date: `date`,
  createdAt: `creation date`,
  updatedAt: `last change date`,
}

/**
 * Checks one transfer of a file with the rules of a write: both amounts above zero and the memo's
 * length and characters ({@link parseTransferRequest}). Throws `TransferError`.
 */
export function parseTransferExportEntry(entry: unknown): TransferExportEntry {
  const shape = transferExportEntrySchema(entry)
  if (shape instanceof type.errors) {
    throw new TransferError(
      `INVALID_REQUEST`,
      plainEntryProblem(shape, `transfer`, TRANSFER_EXPORT_LABELS),
      fieldErrors(shape),
    )
  }
  return parseTransferRequest(transferExportEntrySchema, entry) as TransferExportEntry
}

/** What a transfer of a file points at, by its id in the file; `null` when the file has none. */
export interface TransferFileReferences {
  account(fileId: string): { currency: string } | null
}

/**
 * What is wrong between a file's transfers and the accounts it holds, by index: an account the
 * file lacks or the same account on both sides ({@link assertTransferReferences}), and a transfer
 * between two accounts of one currency whose amounts differ ({@link assertOneCurrencyAmounts}) or
 * that claims a conversion.
 */
export function transferReferenceProblems(
  transfers: readonly Pick<
    TransferExportEntry,
    `fromAccountId` | `toAccountId` | `sentAmount` | `receivedAmount` | `converted`
  >[],
  references: TransferFileReferences,
): { index: number; problem: string; issue: GroupImportIssue }[] {
  const problems: { index: number; problem: string; issue: GroupImportIssue }[] = []
  transfers.forEach((transfer, index) => {
    const found = {
      from: references.account(transfer.fromAccountId),
      to: references.account(transfer.toAccountId),
    }
    try {
      assertTransferReferences(transfer, found)
      if (found.from.currency !== found.to.currency) return
      assertOneCurrencyAmounts(transfer.sentAmount, transfer.receivedAmount)
      if (transfer.converted) {
        throw new TransferError(`INVALID_REQUEST`, `A transfer in one currency is not converted`, {
          converted: { code: `mismatch` },
        })
      }
    } catch (error) {
      if (!(error instanceof TransferError)) throw error
      const [field, { code }] = Object.entries(error.fields ?? {})[0]
      problems.push({ index, problem: messageOfReference(code), issue: { code, field } })
    }
  })
  return problems
}

/** A file's words for a refusal of {@link transferReferenceProblems}, by its field's code. */
function messageOfReference(code: string): string {
  if (code === `notFound`) return `its account is not among the file's accounts`
  if (code === `sameAccount`) return `it moves money from an account to the same account`
  return `between accounts of one currency, the received amount is the sent amount, unconverted`
}
// #endregion Export file

// #region Admin
/** How many calendar months the operator's transfers page counts, the current one last. */
export const ADMIN_TRANSFERS_MONTHS = 6

/** How many households the operator's transfers page lists, the busiest in those months. */
export const ADMIN_TRANSFERS_HOUSEHOLD_LIMIT = 20

/** One calendar month of {@link AdminTransfersOverview}, by the transfers' own date. */
export interface AdminTransfersMonth {
  /** `YYYY-MM`. */
  month: string
  transfers: number
  /** Households with at least one transfer in the month. */
  households: number
}

/** One household of {@link AdminTransfersOverview}: its counts and its last transfer's day. */
export interface AdminTransfersHousehold {
  groupId: string
  groupName: string
  /** Every live transfer the household has, whatever its date. */
  transfers: number
  /** Transfers per month, aligned to {@link AdminTransfersOverview.months}. */
  months: number[]
  /** `YYYY-MM-DD`, the latest date among its live transfers. */
  lastTransferDate: string
}

/**
 * What the operator's transfers page shows: counts and dates only. Never an amount, a currency, a
 * memo, an account or a person: they say how much a household moves and where. Deleted transfers
 * count nowhere.
 */
export interface AdminTransfersOverview {
  /** Live transfers across every household. */
  transfers: number
  /** Households with at least one live transfer. */
  households: number
  /** `YYYY-MM-DD`, the latest date among live transfers, or `null` when there are none. */
  lastTransferDate: string | null
  /** The last {@link ADMIN_TRANSFERS_MONTHS} calendar months in UTC, oldest first, each present. */
  months: AdminTransfersMonth[]
  /**
   * At most {@link ADMIN_TRANSFERS_HOUSEHOLD_LIMIT} households: the most transfers in those months
   * first, then the most transfers overall, then by id.
   */
  topHouseholds: AdminTransfersHousehold[]
}
// #endregion Admin
