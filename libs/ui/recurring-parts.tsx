import type { JSX } from "preact"
import { Badge } from "@spy4x/preact-ui/badge"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { IcalDateKind } from "@spy4x/time/ical"
import { localeFirstWeekday, weekdayLabels } from "@spy4x/time/locale"
import {
  describeRrule,
  formatRrule,
  parseRrule,
  type Rrule,
  RruleFreq,
  type RruleWeekday,
  type RruleWords,
} from "@spy4x/time/rrule"
import { addDays } from "@spy4x/time/tz"
import {
  RECURRING_COUNT_MAX,
  RECURRING_INTERVAL_MAX,
  RecurringPauseReason,
  type RecurringRule,
  type RecurringRuleRequestFields,
  upcomingDates,
} from "@domain/recurring"
import { TransactionKind } from "@domain/transactions"
import type { Message } from "./message.ts"
import { useAppText } from "./i18n.ts"

/** How a rule ends, as the editor offers it: never, on a date, or after a number of entries. */
export enum RepeatEnd {
  NEVER = 1,
  ON_DATE = 2,
  AFTER_COUNT = 3,
}

/** `BYMONTHDAY=-1`: the last day of every month. */
export const LAST_DAY = -1

/**
 * The days a monthly repeat may fall on: 1 to 28, then the last day of the month. Day 29, 30 or 31
 * would leave out the months that lack it, so the server refuses them (`parseRecurrence`).
 */
export const MONTH_DAYS: readonly number[] = [
  ...Array.from({ length: 28 }, (_, index) => index + 1),
  LAST_DAY,
]

/** How many days ahead the household's upcoming list looks, today included. */
export const UPCOMING_DAYS = 30

/** What the editor's fields show: the entry a rule makes, and when. */
export interface RecurringEditorValue {
  kind: TransactionKind
  /** Positive, in `currency`'s smallest unit; `null` while empty. */
  amount: number | null
  currency: string | null
  /** What each entry moves in the account, when the currencies differ and the person typed it. */
  accountAmount: number | null
  accountId: string | null
  categoryId: string | null
  memo: string
  freq: RruleFreq
  /** Every this many days, weeks, months or years; `null` while the field is empty. */
  interval: number | null
  /** A weekly repeat's days, Monday first. */
  weekdays: RruleWeekday[]
  /** A monthly repeat's day: one of {@link MONTH_DAYS}. */
  monthDay: number
  startDate: string
  end: RepeatEnd
  /** The last day an entry may fall on, when {@link end} is `ON_DATE`; `""` while empty. */
  endDate: string
  /** How many entries the rule makes, when {@link end} is `AFTER_COUNT`; `null` while empty. */
  count: number | null
}

/** The editor's errors, per field and for the form. */
export interface RecurringEditorErrors {
  amount: Message | null
  currency: Message | null
  accountAmount: Message | null
  account: Message | null
  category: Message | null
  memo: Message | null
  interval: Message | null
  weekdays: Message | null
  startDate: Message | null
  endDate: Message | null
  count: Message | null
  form: Message | null
}

export const NO_RECURRING_ERRORS: RecurringEditorErrors = {
  amount: null,
  currency: null,
  accountAmount: null,
  account: null,
  category: null,
  memo: null,
  interval: null,
  weekdays: null,
  startDate: null,
  endDate: null,
  count: null,
  form: null,
}

/** The ISO weekday of a `YYYY-MM-DD` date: Monday is 1, Sunday 7. */
export function weekdayOf(date: string): RruleWeekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return (day === 0 ? 7 : day) as RruleWeekday
}

/** The monthly day a date stands for: its own day up to the 28th, else the last day. */
export function monthDayOf(date: string): number {
  const day = Number(date.slice(8, 10))
  return day > 28 ? LAST_DAY : day
}

/** The repeat the fields describe, without its end. */
function repeatOf(value: RecurringEditorValue): Rrule {
  return {
    freq: value.freq,
    interval: value.interval ?? 1,
    byDay: value.freq === RruleFreq.Weekly ? value.weekdays.map((weekday) => ({ weekday })) : [],
    byMonthDay: value.freq === RruleFreq.Monthly ? [value.monthDay] : [],
    byMonth: [],
    weekStart: 1 as RruleWeekday,
  }
}

/** Whether the fields make a repeat that can be written: a weekly one needs a day. */
function repeatIsComplete(value: RecurringEditorValue): boolean {
  return value.freq !== RruleFreq.Weekly || value.weekdays.length > 0
}

/**
 * The repeat in words, in the language of `words`, with its end: "Monthly on day 16, 12 times".
 * `null` while the fields cannot make a repeat yet.
 */
export function repeatSentence(value: RecurringEditorValue, words: RruleWords): string | null {
  if (!repeatIsComplete(value)) return null
  const rule = repeatOf(value)
  if (value.end === RepeatEnd.AFTER_COUNT && value.count !== null) rule.count = value.count
  if (value.end === RepeatEnd.ON_DATE && value.endDate) {
    rule.until = { kind: IcalDateKind.Date, date: value.endDate }
  }
  return describeRrule(rule, words)
}

/** A saved rule's repeat in words, with its end, as {@link repeatSentence} writes it. */
export function ruleSentence(
  rule: Pick<RecurringRule, `rrule` | `endDate` | `count`>,
  words: RruleWords,
): string {
  const parsed = parseRrule(rule.rrule)
  if (!parsed.success) return rule.rrule
  const series: Rrule = { ...parsed.output }
  if (rule.count !== null) series.count = rule.count
  if (rule.endDate !== null) series.until = { kind: IcalDateKind.Date, date: rule.endDate }
  return describeRrule(series, words)
}

/** The next `max` dates the fields would make an entry on, from the start date. */
export function previewDates(value: RecurringEditorValue, max: number): string[] {
  if (!repeatIsComplete(value) || !value.startDate) return []
  const rrule = formatRrule(repeatOf(value))
  if (!rrule.success) return []
  return upcomingDates(
    {
      rrule: rrule.output,
      startDate: value.startDate,
      endDate: value.end === RepeatEnd.ON_DATE && value.endDate ? value.endDate : null,
      count: value.end === RepeatEnd.AFTER_COUNT ? value.count : null,
      skippedDates: [],
      madeThrough: null,
    },
    value.startDate,
    max,
  )
}

/**
 * Checks the fields before a save, so the person sees each mistake under its field without a
 * round trip: the entry's amount, account and category, the repeat's interval and weekdays, and
 * an end that fits the start. The server checks all of it again.
 */
export function recurringErrors(value: RecurringEditorValue): RecurringEditorErrors {
  const errors = { ...NO_RECURRING_ERRORS }
  if (value.amount === null || value.amount <= 0) errors.amount = `RecurringMessages.amount`
  if (value.currency === null) errors.currency = `TransactionMessages.currencyRequired`
  if (value.accountId === null) errors.account = `TransactionMessages.accountRequired`
  if (value.categoryId === null) errors.category = `TransactionMessages.categoryRequired`
  if (
    value.interval === null || !Number.isInteger(value.interval) || value.interval < 1 ||
    value.interval > RECURRING_INTERVAL_MAX
  ) {
    errors.interval = {
      key: `RecurringMessages.interval`,
      values: { max: RECURRING_INTERVAL_MAX },
    }
  }
  if (value.freq === RruleFreq.Weekly && value.weekdays.length === 0) {
    errors.weekdays = `RecurringMessages.weekdays`
  }
  if (!value.startDate) errors.startDate = `RecurringMessages.startDate`
  else if (value.freq === RruleFreq.Yearly && value.startDate.endsWith(`-02-29`)) {
    errors.startDate = `RecurringMessages.leapDay`
  }
  if (value.end === RepeatEnd.ON_DATE) {
    if (!value.endDate) errors.endDate = `RecurringMessages.endDate`
    else if (value.startDate && value.endDate < value.startDate) {
      errors.endDate = `RecurringMessages.endBeforeStart`
    }
  }
  if (
    value.end === RepeatEnd.AFTER_COUNT &&
    (value.count === null || !Number.isInteger(value.count) || value.count < 1 ||
      value.count > RECURRING_COUNT_MAX)
  ) {
    errors.count = { key: `RecurringMessages.count`, values: { max: RECURRING_COUNT_MAX } }
  }
  return errors
}

/** Whether `errors` names anything. */
export function hasRecurringErrors(errors: RecurringEditorErrors): boolean {
  return Object.values(errors).some((error) => error !== null)
}

/**
 * What a save sends for the fields: the repeat as `formatRrule` writes it, and the end date or the
 * count, never both, since the server refuses the two together. Call it after
 * {@link recurringErrors} found nothing.
 */
export function recurringRequest(
  value: RecurringEditorValue,
): RecurringRuleRequestFields & { memo: string } {
  return {
    kind: value.kind,
    amount: value.amount!,
    currency: value.currency!,
    ...(value.accountAmount === null ? {} : { accountAmount: value.accountAmount }),
    accountId: value.accountId!,
    categoryId: value.categoryId!,
    memo: value.memo.trim(),
    rrule: formatRrule(repeatOf(value)).output!,
    startDate: value.startDate,
    ...(value.end === RepeatEnd.ON_DATE ? { endDate: value.endDate } : {}),
    ...(value.end === RepeatEnd.AFTER_COUNT ? { count: value.count! } : {}),
  }
}

/** The repeat's fields with nothing chosen yet: monthly on the start's day, from `startDate`. */
function repeatFields(startDate: string) {
  return {
    freq: RruleFreq.Monthly,
    interval: 1,
    weekdays: [weekdayOf(startDate)],
    monthDay: monthDayOf(startDate),
    startDate,
    end: RepeatEnd.NEVER,
    endDate: ``,
    count: null,
  }
}

/** The entry's fields a new rule starts from: the quick entry's prefill, or an existing entry. */
export interface EntryFields {
  kind: TransactionKind
  amount: number | null
  currency: string | null
  accountId: string | null
  categoryId: string | null
  memo: string
}

/** A new rule's fields: the entry `entry` describes, monthly on today's day, from `today`. */
export function newRecurringValue(entry: EntryFields, today: string): RecurringEditorValue {
  return { ...entry, accountAmount: null, ...repeatFields(today) }
}

/**
 * "Repeat this" on an entry: the same entry, monthly on its day, starting one month after it. Day
 * 29, 30 or 31 becomes the last day of the month, so no month is left out, and the start is then
 * the next month's last day. The account amount is left out: each entry converts on its own date.
 */
export function repeatFromEntry(entry: EntryFields & { date: string }): RecurringEditorValue {
  const monthDay = monthDayOf(entry.date)
  const year = Number(entry.date.slice(0, 4))
  // 1 to 12, so as `Date.UTC`'s 0-based month it is already the next month.
  const month = Number(entry.date.slice(5, 7))
  // Day 0 of the month after next is the next month's last day.
  const day = monthDay === LAST_DAY ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate() : monthDay
  const startDate = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
  return {
    kind: entry.kind,
    amount: entry.amount === null ? null : Math.abs(entry.amount),
    currency: entry.currency,
    accountId: entry.accountId,
    categoryId: entry.categoryId,
    memo: entry.memo,
    accountAmount: null,
    ...repeatFields(startDate),
    monthDay,
  }
}

/** A saved rule's fields, for its editor. */
export function recurringValueOf(
  rule: Pick<
    RecurringRule,
    | `kind`
    | `amount`
    | `currency`
    | `accountAmount`
    | `accountId`
    | `categoryId`
    | `memo`
    | `rrule`
    | `startDate`
    | `endDate`
    | `count`
  >,
): RecurringEditorValue {
  const parsed = parseRrule(rule.rrule)
  const repeat = parsed.success ? parsed.output : null
  return {
    kind: rule.kind,
    amount: rule.amount,
    currency: rule.currency,
    accountAmount: rule.accountAmount,
    accountId: rule.accountId,
    categoryId: rule.categoryId,
    memo: rule.memo,
    freq: repeat?.freq ?? RruleFreq.Monthly,
    interval: repeat?.interval ?? 1,
    weekdays: repeat && repeat.byDay.length > 0
      ? repeat.byDay.map((day) => day.weekday)
      : [weekdayOf(rule.startDate)],
    monthDay: repeat?.byMonthDay[0] ?? monthDayOf(rule.startDate),
    startDate: rule.startDate,
    end: rule.endDate !== null
      ? RepeatEnd.ON_DATE
      : rule.count !== null
      ? RepeatEnd.AFTER_COUNT
      : RepeatEnd.NEVER,
    endDate: rule.endDate ?? ``,
    count: rule.count,
  }
}

/** The seven weekdays as the locale orders and abbreviates them, each with its ISO number. */
export function weekdayChoices(
  locale: string,
): { weekday: RruleWeekday; short: string; long: string }[] {
  const first = localeFirstWeekday(locale)
  return weekdayLabels(locale).map((label, index) => ({
    ...label,
    weekday: (((first - 1 + index) % 7) + 1) as RruleWeekday,
  }))
}

/** What a rule makes and when, as the list draws one row. */
export interface RecurringRuleRow {
  id: string
  kind: TransactionKind
  /** Signed as the entry will be: an expense is below zero. */
  amount: number
  currency: string
  /** The memo, else the category's label: what a person calls the entry. */
  title: string
  accountName: string
  categoryLabel: string
  /** The repeat in words, with its end. */
  repeat: string
  /** The next date it makes an entry on, `null` once it has ended. */
  next: string | null
  paused: RecurringPauseReason | null
}

/** One upcoming entry of the household: the date and the rule that makes it. */
export interface UpcomingRow {
  date: string
  rule: RecurringRuleRow
}

/** A rule as {@link recurringRows} reads it. */
export type RuleFacts = Pick<
  RecurringRule,
  | `id`
  | `kind`
  | `amount`
  | `currency`
  | `accountId`
  | `categoryId`
  | `memo`
  | `rrule`
  | `startDate`
  | `endDate`
  | `count`
  | `skippedDates`
  | `madeThrough`
  | `pausedReason`
>

/**
 * The list's rows and the household's upcoming dates from `today` for {@link UPCOMING_DAYS} days,
 * in date order, each rule's skipped dates and the days it already made left out. Computed on the
 * device, so the page reads offline.
 */
export function recurringRows(
  rules: readonly RuleFacts[],
  context: {
    words: RruleWords
    today: string
    accountName: (id: string) => string
    categoryLabel: (id: string) => string
  },
): { rules: RecurringRuleRow[]; upcoming: UpcomingRow[] } {
  const last = addDays(context.today, UPCOMING_DAYS - 1)
  const upcoming: UpcomingRow[] = []
  const rows = rules.map((rule) => {
    const categoryLabel = context.categoryLabel(rule.categoryId)
    const dates = upcomingDates(rule, context.today, UPCOMING_DAYS + 1, last)
    const row: RecurringRuleRow = {
      id: rule.id,
      kind: rule.kind,
      amount: rule.kind === TransactionKind.EXPENSE ? -rule.amount : rule.amount,
      currency: rule.currency,
      title: rule.memo || categoryLabel,
      accountName: context.accountName(rule.accountId),
      categoryLabel,
      repeat: ruleSentence(rule, context.words),
      next: dates[0] ?? upcomingDates(rule, context.today, 1)[0] ?? null,
      paused: rule.pausedReason as RecurringPauseReason | null,
    }
    for (const date of dates) upcoming.push({ date, rule: row })
    return row
  })
  // A stable sort keeps the rules' own order within a day.
  upcoming.sort((a, b) => a.date.localeCompare(b.date))
  return { rules: rows, upcoming }
}

/** "Paused: the account is archived", for a rule the job stopped making entries for. */
export function PausedBadge({ reason }: { reason: RecurringPauseReason }): JSX.Element {
  const t = useAppText()
  return (
    <span data-e2e="recurring-paused">
      <Badge color="orange" text={pausedText(t, reason)} />
    </span>
  )
}

/** Why a rule is paused, in words. */
export function pausedText(t: Translator<string>, reason: RecurringPauseReason): string {
  switch (reason) {
    case RecurringPauseReason.AUTHOR_CANNOT_WRITE:
      return t.t(`RecurringParts.pausedAuthor`)
    case RecurringPauseReason.ACCOUNT_ARCHIVED:
      return t.t(`RecurringParts.pausedAccount`)
    default:
      return t.t(`RecurringParts.pausedCategory`)
  }
}
