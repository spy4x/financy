import { type Type, type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import type { Actor } from "@domain/identity"
import { canMutateNotes, canRead, type GroupRole } from "@domain/groups"
import {
  assertEntryReferences,
  calendarDate,
  entryFields,
  type EntryReferences,
  parseTransactionRequest,
  TransactionError,
  type TransactionKind,
} from "@domain/transactions"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { IcalDateKind } from "@spy4x/time/ical"
import {
  formatRrule,
  occurrencesBetween,
  parseRrule,
  type Rrule,
  RruleFreq,
  RruleWeekday,
} from "@spy4x/time/rrule"
import type { FieldErrors } from "@spy4x/validation"

/**
 * Repeating rules: an entry a household writes again on a schedule, such as rent on the 1st or a
 * subscription every month, copied from the entries aggregate. A rule belongs to one household (a
 * group), names one of its accounts and one of its categories, and holds the entry it makes (the
 * same fields as an entry) and when: an RFC 5545 repeat (`rrule`), a start date, and an optional
 * end date or count. Every member reads a household's rules and an editor or above writes them.
 *
 * Changing a rule changes only the entries it has not made yet; deleting it keeps the entries it
 * made. This step stores the rules; the job that makes their entries is spy4x/financy#219.
 * `docs/aggregates.md` walks through the files.
 */

/** How long a deleted rule waits to be restored before the worker removes it for good. */
export const RECURRING_RULE_RESTORE_DAYS = 30

/** The longest repeat text a request may send, in characters, before it is parsed. */
export const RECURRING_RRULE_MAX_LENGTH = 200

/** The largest `INTERVAL`: every 99 days, weeks, months or years. */
export const RECURRING_INTERVAL_MAX = 99

/** The most entries a rule with a count makes. */
export const RECURRING_COUNT_MAX = 1000

/** The most dates one rule skips. */
export const RECURRING_SKIPPED_MAX = 500

/** The outbox event kinds a rule change is recorded under, on the group's change log. */
export const RECURRING_RULE_EVENTS = {
  created: `recurring_rule.created`,
  updated: `recurring_rule.updated`,
  deleted: `recurring_rule.deleted`,
  restored: `recurring_rule.restored`,
  skipped: `recurring_rule.skipped`,
} as const

export type RecurringRuleErrorCode =
  | `GROUP_NOT_FOUND`
  | `ID_ALREADY_EXISTS`
  | `INVALID_REQUEST`
  | `RECURRING_RULE_NOT_FOUND`
  | `ROLE_INSUFFICIENT`
  | `VERSION_CONFLICT`

export class RecurringRuleError extends Error {
  constructor(
    public readonly code: RecurringRuleErrorCode,
    message: string,
    /** Each failed field's code and rule, when a rule of the repeat refused the request. */
    public readonly fields?: FieldErrors,
  ) {
    super(message)
    this.name = `RecurringRuleError`
  }
}

/**
 * A write named a version the rule has moved past. It carries the version the rule is at now, so
 * the client can reread it instead of overwriting a change it never saw.
 */
export class RecurringRuleVersionConflictError extends RecurringRuleError {
  constructor(public readonly currentVersion: number) {
    super(
      `VERSION_CONFLICT`,
      `The repeating entry was changed by someone else`,
    )
    this.name = `RecurringRuleVersionConflictError`
  }
}

/** One rule as the API returns it. */
export interface RecurringRule {
  id: string
  groupId: string
  accountId: string
  categoryId: string
  kind: TransactionKind
  /** What each entry pays, above zero, in `currency`'s smallest unit; the entry sets the sign. */
  amount: number
  currency: string
  /** A manual rate: what moves in the account, above zero; `null` converts on each entry's date. */
  accountAmount: number | null
  memo: string
  /**
   * The repeat, as `RRULE` text without `COUNT` or `UNTIL` (those are {@link endDate} and
   * {@link count}), written by `formatRrule`, such as `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`.
   */
  rrule: string
  /** The first day an entry may fall on, `YYYY-MM-DD`, in the household's time zone. */
  startDate: string
  /** The last day an entry may fall on, included; `null` for none. Never set with `count`. */
  endDate: string | null
  /** How many entries the rule makes in all; `null` for no count. Never set with `endDate`. */
  count: number | null
  /** Occurrences that make no entry, in date order. */
  skippedDates: string[]
  /** The last day the job made entries through; `null` until it first runs. */
  madeThrough: string | null
  /** Why the job stopped making entries; `null` while it runs. Set only by the job. */
  pausedReason: number | null
  /** Starts at 1 and grows by one with every change; a change or delete must name it. */
  version: number
  /** The group's change sequence this rule was last written at, as a decimal string (BIGINT). */
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: Date
  updatedAt: Date
  /** `null` while live; set while the rule waits in the trash. */
  deletedAt: Date | null
}

// #region Request schemas
const versionField = { version: `number.integer >= 1` } as const
const groupIdField = { groupId: UUID_PATTERN } as const
const idField = { id: UUID_PATTERN } as const
/** What a person sets on a rule: the entry it makes and when, never what the job sets. */
const ruleFields = {
  ...entryFields,
  rrule: `string <= ${RECURRING_RRULE_MAX_LENGTH}`,
  startDate: calendarDate,
  "endDate?": calendarDate,
  "count?": `1 <= number.integer <= ${RECURRING_COUNT_MAX}`,
} as const

/** The `recurring.create` payload: a client-made id, so a retry cannot add a second rule. */
export const recurringRuleCreatePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...ruleFields,
  "memo?": `string`,
  "+": `reject`,
})
/**
 * The `recurring.update` payload: every field again, and the version edited. An end date or a
 * count left out is no end, so an edit that names neither makes the rule open-ended.
 */
export const recurringRuleUpdatePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...ruleFields,
  memo: `string`,
  ...versionField,
  "+": `reject`,
})
/** The `recurring.delete` payload: the version the person saw when deleting. */
export const recurringRuleDeletePayloadSchema = type({
  ...groupIdField,
  ...idField,
  ...versionField,
  "+": `reject`,
})
/** The `recurring.restore` payload: nothing but a restore changes a deleted rule. */
export const recurringRuleRestorePayloadSchema = type({
  ...groupIdField,
  ...idField,
  "+": `reject`,
})
/**
 * The `recurring.skip` payload: the occurrence that makes no entry. No version: skipping a date
 * twice skips it once, so two people skipping at once cannot undo each other.
 */
export const recurringRuleSkipPayloadSchema = type({
  ...groupIdField,
  ...idField,
  date: calendarDate,
  "+": `reject`,
})
/** The `recurring.get` payload. */
export const recurringRuleGetPayloadSchema = type({
  ...groupIdField,
  ...idField,
  "+": `reject`,
})
/** The `recurring.list` payload. */
export const recurringRuleListPayloadSchema = type({
  ...groupIdField,
  "+": `reject`,
})

/** Throws `INVALID_REQUEST` for `field` with the field code `code`. */
function refuse(
  field: string,
  code: string,
  message: string,
  rule?: string | number,
): never {
  throw new RecurringRuleError(`INVALID_REQUEST`, message, {
    [field]: rule === undefined ? { code } : { code, values: { rule } },
  })
}

/**
 * Checks a repeat against the subset Financy makes entries for (the request schemas cap its
 * length at {@link RECURRING_RRULE_MAX_LENGTH} before it is parsed), and returns it as
 * `formatRrule` writes it, the one text stored for it. The subset never skips a period in silence:
 *
 * - `FREQ` is daily, weekly, monthly or yearly, and `INTERVAL` at most
 *   {@link RECURRING_INTERVAL_MAX}.
 * - Weekly names its weekdays (`BYDAY=MO,TH`), without a number and each once.
 * - Monthly names its days (`BYMONTHDAY`; one named twice is kept once), from 1 to 28 or -1 for
 *   the last day of the month: day 29, 30 or 31 would leave out the months that lack it.
 * - Daily and yearly take no `BY` part; yearly repeats on the start date's day, which therefore
 *   cannot be 29 February.
 * - `COUNT` and `UNTIL` are refused: the end is the rule's `endDate` or `count`, never its text.
 *   `BYMONTH`, `BYSETPOS`, a week start other than Monday and every other part are refused too.
 *
 * Throws `RecurringRuleError("INVALID_REQUEST")` naming the field at fault.
 */
export function parseRecurrence(text: string, startDate: string): string {
  const parsed = parseRrule(text)
  if (!parsed.success) {
    refuse(`rrule`, `invalid`, `The repeat is not one Financy can make`)
  }
  const rule = parsed.output
  if (rule.count !== undefined || rule.until !== undefined) {
    refuse(
      `rrule`,
      `invalid`,
      `The end of a repeat is its end date or count, not COUNT or UNTIL`,
    )
  }
  if (rule.interval > RECURRING_INTERVAL_MAX) {
    refuse(
      `rrule`,
      `max`,
      `A repeat runs at most every ${RECURRING_INTERVAL_MAX} periods`,
      RECURRING_INTERVAL_MAX,
    )
  }
  if (rule.byMonth.length > 0 || rule.weekStart !== RruleWeekday.Monday) {
    refuse(
      `rrule`,
      `invalid`,
      `A repeat takes no BYMONTH and starts its week on Monday`,
    )
  }
  // The parser keeps a weekday named twice (`BYDAY=MO,MO`) and drops a repeated day of the month.
  if (new Set(rule.byDay.map((day) => day.weekday)).size !== rule.byDay.length) {
    refuse(`rrule`, `invalid`, `A repeat names each weekday once`)
  }
  if (rule.freq === RruleFreq.Weekly && rule.byDay.length === 0) {
    refuse(`rrule`, `invalid`, `A weekly repeat names its weekdays`)
  }
  if (rule.freq === RruleFreq.Monthly) {
    if (rule.byDay.length > 0 || rule.byMonthDay.length === 0) {
      refuse(
        `rrule`,
        `invalid`,
        `A monthly repeat names its days of the month`,
      )
    }
    if (rule.byMonthDay.some((day) => day !== -1 && (day < 1 || day > 28))) {
      refuse(
        `rrule`,
        `invalid`,
        `A monthly repeat takes days 1 to 28, or the last day (-1)`,
      )
    }
  }
  if (
    (rule.freq === RruleFreq.Daily || rule.freq === RruleFreq.Yearly) &&
    (rule.byDay.length > 0 || rule.byMonthDay.length > 0)
  ) {
    refuse(`rrule`, `invalid`, `A daily or yearly repeat takes no days`)
  }
  if (rule.freq === RruleFreq.Yearly && startDate.endsWith(`-02-29`)) {
    refuse(
      `startDate`,
      `invalid`,
      `A yearly repeat cannot start on 29 February`,
    )
  }
  return formatRrule(rule).output!
}

/** What a request sets on a rule, as it arrives after parsing. */
export interface RecurringRuleRequestFields {
  accountId: string
  categoryId: string
  kind: TransactionKind
  amount: number
  currency: string
  accountAmount?: number
  memo?: string
  rrule: string
  startDate: string
  endDate?: string
  count?: number
}

/**
 * Validates `value` against `schema` and the memo as an entry's memo (`parseTransactionRequest`),
 * then, for a create or an update, the end and the repeat: an end date and a count together, or an
 * end date before the start, are refused, and the repeat is returned as {@link parseRecurrence}
 * stores it. Throws `TransactionError` or `RecurringRuleError`, both `INVALID_REQUEST`.
 */
export function parseRecurringRuleRequest<S extends Type<object>>(
  schema: S,
  value: unknown,
): S["infer"] {
  const parsed = parseTransactionRequest(schema, value) as S["infer"] & {
    rrule?: string
    startDate?: string
    endDate?: string
    count?: number
  }
  if (parsed.rrule === undefined || parsed.startDate === undefined) {
    return parsed
  }
  if (parsed.endDate !== undefined && parsed.count !== undefined) {
    refuse(
      `count`,
      `invalid`,
      `A repeat ends on a date or after a count, not both`,
    )
  }
  if (parsed.endDate !== undefined && parsed.endDate < parsed.startDate) {
    refuse(
      `endDate`,
      `after`,
      `The end date is on or after the start date`,
      parsed.startDate,
    )
  }
  return { ...parsed, rrule: parseRecurrence(parsed.rrule, parsed.startDate) }
}
// #endregion Request schemas

// #region Authorization
/**
 * Throws unless `role` may read the household's rules. `null` means the actor is not a member,
 * which answers "group not found" so a stranger cannot tell a household exists.
 */
export function assertCanReadRecurringRules(role: GroupRole | null): void {
  if (role === null || !canRead(role)) {
    throw new RecurringRuleError(`GROUP_NOT_FOUND`, `Group not found`)
  }
}

/** Throws unless `role` may add, change, skip, delete or restore rules (R16). */
export function assertCanWriteRecurringRules(role: GroupRole | null): void {
  assertCanReadRecurringRules(role)
  if (!canMutateNotes(role!)) {
    throw new RecurringRuleError(
      `ROLE_INSUFFICIENT`,
      `Only an editor can change repeating entries`,
    )
  }
}
// #endregion Authorization

// #region Rules
/** What a rule stores of what a person sets, after parsing: no end is `null`. */
export interface RecurringRuleFields {
  accountId: string
  categoryId: string
  kind: TransactionKind
  amount: number
  currency: string
  accountAmount: number | null
  memo: string
  rrule: string
  startDate: string
  endDate: string | null
  count: number | null
}

/**
 * Checks what a rule's entries will point at, as an entry's are checked (R12, R17): another
 * household's account or category answers `ACCOUNT_NOT_FOUND` or `CATEGORY_NOT_FOUND`, and an
 * expense takes an expense category. In the account's own currency a stated account amount must be
 * the amount, as on an entry. Throws `TransactionError`.
 */
export function assertRuleReferences(
  fields: Pick<
    RecurringRuleFields,
    `kind` | `amount` | `currency` | `accountAmount`
  >,
  references: EntryReferences,
): void {
  assertEntryReferences(fields.kind, references)
  if (
    fields.currency === references.account.currency &&
    fields.accountAmount !== null &&
    fields.accountAmount !== fields.amount
  ) {
    throw new TransactionError(
      `INVALID_REQUEST`,
      `In the account's own currency, the account amount is the amount`,
      { accountAmount: { code: `mismatch` } },
    )
  }
}

/**
 * Whether `date` is an occurrence of `rule`: on or after its start, on or before its end date, not
 * past its count, and a day its repeat selects. A skipped date is still an occurrence.
 */
export function isOccurrence(
  rule: Pick<RecurringRule, `rrule` | `startDate` | `endDate` | `count`>,
  date: string,
): boolean {
  const parsed = parseRrule(rule.rrule)
  if (!parsed.success) return false
  const series: Rrule = { ...parsed.output }
  if (rule.count !== null) series.count = rule.count
  if (rule.endDate !== null) {
    series.until = { kind: IcalDateKind.Date, date: rule.endDate }
  }
  const day = new Date(`${date}T00:00:00Z`)
  const found = occurrencesBetween(series, {
    start: { kind: IcalDateKind.Date, date: rule.startDate },
    from: day,
    to: day,
    limit: 1,
  })
  return found.success && found.output.length === 1
}

/**
 * The skipped dates of `rule` with `date` added, in order, or `null` when it is skipped already.
 * Refuses a date that is not an occurrence ({@link isOccurrence}) and a rule that already skips
 * {@link RECURRING_SKIPPED_MAX} dates. Throws `RecurringRuleError("INVALID_REQUEST")`.
 */
export function skipDate(
  rule: Pick<
    RecurringRule,
    `rrule` | `startDate` | `endDate` | `count` | `skippedDates`
  >,
  date: string,
): string[] | null {
  if (rule.skippedDates.includes(date)) return null
  if (!isOccurrence(rule, date)) {
    refuse(`date`, `invalid`, `The date is not one the repeat falls on`)
  }
  if (rule.skippedDates.length >= RECURRING_SKIPPED_MAX) {
    refuse(
      `date`,
      `maxItems`,
      `A repeat skips at most ${RECURRING_SKIPPED_MAX} dates`,
      RECURRING_SKIPPED_MAX,
    )
  }
  return [...rule.skippedDates, date].sort()
}
// #endregion Rules

// #region Commands and queries
/** What every command carries besides its own fields. */
interface RecurringRuleCommandBase {
  actor: Actor
  groupId: string
  id: string
  /** The request this came from. */
  requestId?: string
  /** Makes a retry of this command safe; see the idempotency middleware on the command bus. */
  idempotencyKey?: string
}

export interface RecurringRuleCreatePayload
  extends RecurringRuleCommandBase, RecurringRuleRequestFields {}

export interface RecurringRuleWriteResult {
  rule: RecurringRule
  /** `false` when the same rule was already created by an earlier try of the same request. */
  created: boolean
}

export class RecurringRuleCreateCommand
  implements Command<RecurringRuleCreatePayload, RecurringRuleWriteResult> {
  __resultType?: RecurringRuleWriteResult
  /** The household's plan cap on rules (`maxRecurringRules`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: RecurringRuleCreatePayload) {}
}

export interface RecurringRuleUpdatePayload
  extends RecurringRuleCommandBase, RecurringRuleRequestFields {
  memo: string
  /** The version the person edited; a rule at any other version is not changed. */
  version: number
}

/** Changes the entries a rule has not made yet; the ones it made stay as they are. */
export class RecurringRuleUpdateCommand
  implements Command<RecurringRuleUpdatePayload, { rule: RecurringRule }> {
  __resultType?: { rule: RecurringRule }
  constructor(public data: RecurringRuleUpdatePayload) {}
}

export interface RecurringRuleDeletePayload extends RecurringRuleCommandBase {
  version: number
}

/** Moves a rule to the trash for {@link RECURRING_RULE_RESTORE_DAYS} days; its entries stay. */
export class RecurringRuleDeleteCommand
  implements Command<RecurringRuleDeletePayload, { rule: RecurringRule }> {
  __resultType?: { rule: RecurringRule }
  constructor(public data: RecurringRuleDeletePayload) {}
}

export type RecurringRuleRestorePayload = RecurringRuleCommandBase

/** Brings a deleted rule back; it counts against the household's plan again. */
export class RecurringRuleRestoreCommand
  implements Command<RecurringRuleRestorePayload, { rule: RecurringRule }> {
  __resultType?: { rule: RecurringRule }
  /** The household's plan cap on rules (`maxRecurringRules`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: RecurringRuleRestorePayload) {}
}

export interface RecurringRuleSkipPayload extends RecurringRuleCommandBase {
  date: string
}

/** Makes one occurrence of a rule make no entry; skipping it again changes nothing. */
export class RecurringRuleSkipCommand
  implements Command<RecurringRuleSkipPayload, { rule: RecurringRule }> {
  __resultType?: { rule: RecurringRule }
  constructor(public data: RecurringRuleSkipPayload) {}
}

export interface RecurringRuleGetPayload {
  actor: Actor
  groupId: string
  id: string
}

export class RecurringRuleGetQuery
  implements Query<RecurringRuleGetPayload, { rule: RecurringRule }> {
  __resultType?: { rule: RecurringRule }
  constructor(public data: RecurringRuleGetPayload) {}
}

export interface RecurringRuleListPayload {
  actor: Actor
  groupId: string
}

/** The household's live rules, oldest first. */
export class RecurringRuleListQuery
  implements Query<RecurringRuleListPayload, { rules: RecurringRule[] }> {
  __resultType?: { rules: RecurringRule[] }
  constructor(public data: RecurringRuleListPayload) {}
}
// #endregion Commands and queries

// #region Ports
interface RecurringRuleInputBase {
  groupId: string
  id: string
  requestId?: string
}

/**
 * The household's plan cap on rules, as the entitlement gate read it; `null` is no cap. The write
 * counts again under the household's lock, so two requests cannot both take the last slot.
 */
interface RecurringRuleAllowance {
  allowance: number | null
}

export interface RecurringRuleCreateInput
  extends RecurringRuleInputBase, RecurringRuleFields, RecurringRuleAllowance {}

export interface RecurringRuleUpdateInput extends RecurringRuleInputBase, RecurringRuleFields {
  expectedVersion: number
}

export interface RecurringRuleDeleteInput extends RecurringRuleInputBase {
  expectedVersion: number
}

export interface RecurringRuleRestoreInput extends RecurringRuleInputBase, RecurringRuleAllowance {}

export interface RecurringRuleSkipInput extends RecurringRuleInputBase {
  date: string
}

/**
 * Where rules are kept. Every write checks the actor's role again on the locked membership row
 * (`lockActorRole`), reads the account and category inside the household under that lock
 * ({@link assertRuleReferences}) and records one change on the group in its own transaction. Every
 * id is looked up inside its group, so another household's rule is `RECURRING_RULE_NOT_FOUND`, the
 * same as one that does not exist.
 */
export interface RecurringRuleRepository {
  /** A live rule of the group; `null` for a deleted one or another group's. */
  get(groupId: string, id: string): Promise<RecurringRule | null>
  /** The group's live rules, oldest first. */
  list(groupId: string): Promise<RecurringRule[]>
  /** How many live rules the household holds: what the plan's `maxRecurringRules` counts. */
  count(groupId: string): Promise<number>
  /**
   * Throws `ID_ALREADY_EXISTS` when the id holds a different rule, the refusals of
   * {@link assertRuleReferences}, and a `PlanError` when the plan's `allowance` is used up. A retry
   * of a create that landed is answered with its rule.
   */
  create(
    input: RecurringRuleCreateInput,
    actorId: number,
  ): Promise<RecurringRuleWriteResult>
  /**
   * Throws `RECURRING_RULE_NOT_FOUND`, {@link RecurringRuleVersionConflictError} or a create's
   * refusals. Never touches an entry.
   */
  update(
    input: RecurringRuleUpdateInput,
    actorId: number,
  ): Promise<RecurringRule>
  /** Throws `RECURRING_RULE_NOT_FOUND` or {@link RecurringRuleVersionConflictError}. */
  delete(
    input: RecurringRuleDeleteInput,
    actorId: number,
  ): Promise<RecurringRule>
  /**
   * Throws `RECURRING_RULE_NOT_FOUND` for a rule that is not deleted, the refusals of
   * {@link assertRuleReferences} (its account may be gone), or a `PlanError`.
   */
  restore(
    input: RecurringRuleRestoreInput,
    actorId: number,
  ): Promise<RecurringRule>
  /**
   * Throws `RECURRING_RULE_NOT_FOUND` or the refusals of {@link skipDate}. A date skipped already
   * answers the rule as it is, and records no change.
   */
  skip(input: RecurringRuleSkipInput, actorId: number): Promise<RecurringRule>
}
// #endregion Ports
