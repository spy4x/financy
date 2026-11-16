import type { ComponentChildren, JSX } from "preact"
import { useMemo } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { Card } from "@spy4x/preact-ui/card"
import { CurrencyField } from "@spy4x/preact-ui/currency-field"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Field } from "@spy4x/preact-ui/field"
import { useFormat } from "@spy4x/preact-ui/format"
import { Input } from "@spy4x/preact-ui/input"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Stack } from "@spy4x/preact-ui/layout"
import { MoneyInput } from "@spy4x/preact-ui/money-input"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { SegmentedControl } from "@spy4x/preact-ui/segmented-control"
import { ToggleChips } from "@spy4x/preact-ui/toggle-chips"
import { dayLabel } from "@spy4x/time/locale"
import { RruleFreq, type RruleWeekday, type RruleWords } from "@spy4x/time/rrule"
import { currencyOptions } from "@spy4x/platform/universal/money-core"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { PlanRefusal } from "@domain/billing"
import { amountDecimals, COINS } from "@domain/money"
import { RECURRING_COUNT_MAX, RECURRING_INTERVAL_MAX } from "@domain/recurring"
import { TRANSACTION_AMOUNT_MAX, TransactionKind } from "@domain/transactions"
import { ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import { FORM_WIDTH, useWaited } from "./tag-editor-screen.tsx"
import { categoryGroups } from "./transaction-editor-screen.tsx"
import {
  EntryAmount,
  type TransactionAccount,
  type TransactionCategory,
} from "./transaction-parts.tsx"
import {
  LAST_DAY,
  MONTH_DAYS,
  PausedBadge,
  previewDates,
  type RecurringEditorErrors,
  type RecurringEditorValue,
  type RecurringRuleRow,
  RepeatEnd,
  repeatSentence,
  weekdayChoices,
} from "./recurring-parts.tsx"
import { type Navigate, RECURRING_PATHS, ScreenForm } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

/** How many of the next dates the editor lists under the repeat sentence. */
const PREVIEW_DATES = 3

export interface RecurringEditorScreenProps {
  group: NotesGroup | null
  loading: boolean
  /** The rule is not in this household: deleted, never there, or another household's. */
  notFound: boolean
  /** The rule being edited, as the list draws it, or `null` on the create page. */
  rule: RecurringRuleRow | null
  value: RecurringEditorValue
  onChange?: (next: Partial<RecurringEditorValue>) => void
  errors: RecurringEditorErrors
  plan?: PlanRefusal | null
  accounts: readonly TransactionAccount[]
  categories: readonly TransactionCategory[]
  /** The app's catalog, which carries the repeat's words in the person's language. */
  words: RruleWords
  saving: boolean
  /** The fields differ from the saved rule; an existing rule shows Save only then. */
  dirty: boolean
  onSave?: () => void
  onDelete?: () => void
  /** A delete is in flight. */
  pending?: boolean
  recentCurrencies?: readonly string[]
  navigate?: Navigate
}

/**
 * One repeating entry on a page of its own, at `/recurring/new` and `/recurring/:id`: the entry it
 * makes, then how often, from when and until when, with the repeat in words and its next dates
 * under the fields as they change. Delete sits in the page's menu. A viewer sees the rule as text.
 */
export function RecurringEditorScreen(props: RecurringEditorScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  const back = { href: RECURRING_PATHS.list, label: t.t(`RecurringEditor.back`) }
  const waited = useWaited(props.loading)
  if (!group || props.notFound || (props.loading && !props.rule)) {
    return (
      <Stack gap="xl">
        <PageHeader
          back={back}
          navigate={navigate}
          title={t.t(`RecurringEditor.title`)}
          subtitle={group?.name}
        />
        {!group && !props.loading && <NoGroup loading={false} navigate={navigate} />}
        {group && props.notFound && (
          <div data-e2e="recurring-not-found">
            <ListEmpty
              title={t.t(`RecurringEditor.notFound`)}
              description={t.t(`RecurringEditor.notFoundHint`)}
              action={
                <Button href={RECURRING_PATHS.list} navigate={navigate} variant="outline">
                  {t.t(`RecurringEditor.back`)}
                </Button>
              }
            />
          </div>
        )}
        {props.loading && waited && (
          <div data-e2e="recurring-loading">
            <p role="status" class="sr-only">{t.t(`RecurringEditor.loading`)}</p>
            <LoadingSkeleton rows={4} class={FORM_WIDTH} />
          </div>
        )}
      </Stack>
    )
  }
  return group.canWrite
    ? <Editor {...props} group={group} back={back} />
    : <ReadOnly {...props} group={group} back={back} />
}

type Shown = RecurringEditorScreenProps & {
  group: NotesGroup
  back: { href: string; label: string }
}

/** The unit after "Every N", in the plural `interval` asks for. */
function unitOptions(t: Translator<string>, interval: number | null) {
  const count = interval ?? 1
  return [
    { value: RruleFreq.Daily, label: t.t(`RecurringEditor.days`, { count }) },
    { value: RruleFreq.Weekly, label: t.t(`RecurringEditor.weeks`, { count }) },
    { value: RruleFreq.Monthly, label: t.t(`RecurringEditor.months`, { count }) },
    { value: RruleFreq.Yearly, label: t.t(`RecurringEditor.years`, { count }) },
  ]
}

/** A whole number typed in a field, or `null` while it is empty or not a number. */
function wholeNumber(text: string): number | null {
  const number = Number(text)
  return text.trim() === `` || !Number.isFinite(number) ? null : number
}

function Editor(props: Shown): JSX.Element {
  const { group, rule, value, errors, saving, navigate } = props
  const t = useAppText()
  const { locale } = useFormat()
  const change = (next: Partial<RecurringEditorValue>) => props.onChange?.(next)
  const account = props.accounts.find((candidate) => candidate.id === value.accountId)
  const accountCurrency = account?.currency ?? null
  const converted = value.currency !== null && accountCurrency !== null &&
    value.currency !== accountCurrency
  const options = useMemo(() => currencyOptions(t.language, COINS), [t.language])
  const groups = categoryGroups(value.kind, props.categories, value.categoryId)
  const weekdays = useMemo(() => weekdayChoices(locale), [locale])
  const sentence = repeatSentence(value, props.words)
  const preview = previewDates(value, PREVIEW_DATES)
  const showFooter = rule === null || props.dirty
  const menu = rule && props.onDelete && (
    <DropdownItem
      onClick={props.onDelete}
      disabled={props.pending}
      danger
      dataE2E="recurring-delete"
    >
      {t.t(`RecurringEditor.delete`)}
    </DropdownItem>
  )
  return (
    <Stack gap="xl">
      <PageHeader
        back={props.back}
        navigate={navigate}
        title={rule ? t.t(`RecurringEditor.title`) : t.t(`RecurringEditor.new`)}
        titleDataE2E="recurring-editor-title"
        subtitle={group.name}
        menuDataE2E="recurring-editor-menu"
        menu={menu}
      />
      {rule?.paused != null && <PausedBadge reason={rule.paused} />}
      <ScreenForm
        pending={saving}
        onSubmit={() => {
          if (rule === null || props.dirty) props.onSave?.()
        }}
      >
        <Stack class={FORM_WIDTH}>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium" aria-hidden="true">
                {t.t(`TransactionEditor.kind`)}
              </span>
              <div data-e2e="recurring-kind">
                <SegmentedControl
                  ariaLabel={t.t(`TransactionEditor.kind`)}
                  options={[
                    {
                      value: String(TransactionKind.EXPENSE),
                      label: t.t(`TransactionEditor.expense`),
                    },
                    {
                      value: String(TransactionKind.INCOME),
                      label: t.t(`TransactionEditor.income`),
                    },
                  ]}
                  value={String(value.kind)}
                  onChange={(kind) => change({ kind: Number(kind) as TransactionKind })}
                />
              </div>
            </div>
            <Field
              id="recurring-amount"
              label={t.t(`TransactionEditor.amount`)}
              error={messageText(t, errors.amount)}
              required
            >
              {(wiring) => (
                <MoneyInput
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  aria-invalid={errors.amount !== null}
                  name="amount"
                  class="text-lg"
                  data-e2e="recurring-amount"
                  value={value.currency === null ? null : value.amount}
                  onChange={(amount) => change({ amount })}
                  currency={value.currency ?? ""}
                  decimals={value.currency === null ? undefined : amountDecimals(value.currency)}
                  disabled={value.currency === null}
                  min={0}
                  max={TRANSACTION_AMOUNT_MAX}
                  placeholder="0"
                  invalidMessage={t.t(`AccountEditor.amountInvalid`)}
                  rangeMessage={() => t.t(`AccountEditor.amountTooLarge`)}
                  decimalsMessage={(decimals) =>
                    decimals === 0
                      ? t.t(`AccountEditor.amountNoDecimals`, { currency: value.currency ?? "" })
                      : t.t(`AccountEditor.amountDecimals`, {
                        count: decimals,
                        currency: value.currency ?? "",
                      })}
                />
              )}
            </Field>
            <Field
              id="recurring-currency"
              label={t.t(`TransactionEditor.currency`)}
              error={messageText(t, errors.currency)}
              required
            >
              {(wiring) => (
                <CurrencyField
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  value={value.currency}
                  onChange={(currency) => change({ currency })}
                  options={options}
                  recent={props.recentCurrencies}
                />
              )}
            </Field>
            {converted && (
              <Field
                id="recurring-account-amount"
                label={t.t(`TransactionEditor.accountAmount`, { currency: accountCurrency! })}
                error={messageText(t, errors.accountAmount)}
                hint={t.t(`RecurringEditor.accountAmountHint`)}
              >
                {(wiring) => (
                  <MoneyInput
                    id={wiring.id}
                    aria-describedby={wiring["aria-describedby"]}
                    name="accountAmount"
                    value={value.accountAmount}
                    onChange={(accountAmount) => change({ accountAmount })}
                    currency={accountCurrency!}
                    decimals={amountDecimals(accountCurrency!)}
                    min={0}
                    max={TRANSACTION_AMOUNT_MAX}
                    invalidMessage={t.t(`AccountEditor.amountInvalid`)}
                    rangeMessage={() => t.t(`AccountEditor.amountTooLarge`)}
                  />
                )}
              </Field>
            )}
            <Field
              id="recurring-account"
              label={t.t(`TransactionEditor.account`)}
              error={messageText(t, errors.account)}
              required
            >
              <select
                class="pc-select"
                name="accountId"
                data-e2e="recurring-account"
                value={value.accountId ?? ""}
                onChange={(e) => change({ accountId: e.currentTarget.value || null })}
                required
              >
                {value.accountId === null && <option value="" />}
                {props.accounts
                  .filter((candidate) => !candidate.archived || candidate.id === value.accountId)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {`${candidate.name} · ${candidate.currency}`}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              id="recurring-category"
              label={t.t(`TransactionEditor.category`)}
              error={messageText(t, errors.category)}
              required
            >
              {(wiring) => (
                <select
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  aria-invalid={errors.category !== null}
                  aria-required="true"
                  class="pc-select"
                  name="categoryId"
                  data-e2e="recurring-category"
                  value={value.categoryId ?? ""}
                  onChange={(e) => change({ categoryId: e.currentTarget.value || null })}
                >
                  <option value="">{t.t(`TransactionEditor.chooseCategory`)}</option>
                  {groups.own.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                  {groups.refund.length > 0 && (
                    <optgroup label={t.t(`TransactionEditor.refundGroup`)}>
                      {groups.refund.map((category) => (
                        <option key={category.id} value={category.id}>{category.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </Field>
            <Field
              id="recurring-memo"
              label={t.t(`TransactionEditor.memo`)}
              error={messageText(t, errors.memo)}
            >
              <Input
                name="memo"
                autocomplete="off"
                data-e2e="recurring-memo"
                value={value.memo}
                onInput={(e) => change({ memo: e.currentTarget.value })}
              />
            </Field>
          </div>
          <fieldset class="flex flex-col gap-4" data-e2e="recurring-repeat-fields">
            <legend class="mb-4 text-base font-semibold">{t.t(`RecurringEditor.repeat`)}</legend>
            <div class="flex items-start gap-2">
              <div class="w-24 shrink-0">
                <Field
                  id="recurring-interval"
                  label={t.t(`RecurringEditor.every`)}
                  error={messageText(t, errors.interval)}
                  required
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    name="interval"
                    min={1}
                    max={RECURRING_INTERVAL_MAX}
                    data-e2e="recurring-interval"
                    value={value.interval ?? ``}
                    onInput={(e) => change({ interval: wholeNumber(e.currentTarget.value) })}
                  />
                </Field>
              </div>
              <div class="min-w-0 flex-1">
                <Field id="recurring-freq" label={t.t(`RecurringEditor.unit`)} required>
                  <select
                    class="pc-select"
                    name="freq"
                    data-e2e="recurring-freq"
                    value={String(value.freq)}
                    onChange={(e) => change({ freq: Number(e.currentTarget.value) as RruleFreq })}
                  >
                    {unitOptions(t, value.interval).map((option) => (
                      <option key={option.value} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            {value.freq === RruleFreq.Weekly && (
              <div class="flex flex-col gap-2" data-e2e="recurring-weekdays">
                <span class="text-sm font-medium" aria-hidden="true">
                  {t.t(`RecurringEditor.onDays`)}
                </span>
                <ToggleChips
                  label={t.t(`RecurringEditor.onDays`)}
                  options={weekdays.map((day) => ({
                    value: String(day.weekday),
                    label: day.short,
                  }))}
                  value={value.weekdays.map(String)}
                  onChange={(chosen) =>
                    change({
                      weekdays: chosen.map(Number).sort((a, b) =>
                        a - b
                      ) as RruleWeekday[],
                    })}
                />
                {errors.weekdays && (
                  <p class="text-sm text-danger" role="alert">{messageText(t, errors.weekdays)}</p>
                )}
              </div>
            )}
            {value.freq === RruleFreq.Monthly && (
              <Field id="recurring-month-day" label={t.t(`RecurringEditor.onDay`)} required>
                <select
                  class="pc-select"
                  name="monthDay"
                  data-e2e="recurring-month-day"
                  value={value.monthDay}
                  onChange={(e) =>
                    change({ monthDay: Number(e.currentTarget.value) })}
                >
                  {MONTH_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {day === LAST_DAY ? t.t(`RecurringEditor.lastDay`) : String(day)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              id="recurring-start"
              label={t.t(`RecurringEditor.start`)}
              error={messageText(t, errors.startDate)}
              hint={t.t(`RecurringEditor.startHint`)}
              required
            >
              <Input
                type="date"
                name="startDate"
                class="min-w-0"
                data-e2e="recurring-start"
                value={value.startDate}
                onChange={(e) => change({ startDate: e.currentTarget.value })}
                required
              />
            </Field>
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium" aria-hidden="true">
                {t.t(`RecurringEditor.ends`)}
              </span>
              <div data-e2e="recurring-end">
                <SegmentedControl
                  ariaLabel={t.t(`RecurringEditor.ends`)}
                  options={[
                    { value: String(RepeatEnd.NEVER), label: t.t(`RecurringEditor.endNever`) },
                    { value: String(RepeatEnd.ON_DATE), label: t.t(`RecurringEditor.endOnDate`) },
                    {
                      value: String(RepeatEnd.AFTER_COUNT),
                      label: t.t(`RecurringEditor.endAfter`),
                    },
                  ]}
                  value={String(value.end)}
                  onChange={(end) => change({ end: Number(end) as RepeatEnd })}
                />
              </div>
            </div>
            {value.end === RepeatEnd.ON_DATE && (
              <Field
                id="recurring-end-date"
                label={t.t(`RecurringEditor.endDate`)}
                error={messageText(t, errors.endDate)}
                required
              >
                <Input
                  type="date"
                  name="endDate"
                  class="min-w-0"
                  data-e2e="recurring-end-date"
                  min={value.startDate}
                  value={value.endDate}
                  onChange={(e) => change({ endDate: e.currentTarget.value })}
                />
              </Field>
            )}
            {value.end === RepeatEnd.AFTER_COUNT && (
              <Field
                id="recurring-count"
                label={t.t(`RecurringEditor.count`)}
                error={messageText(t, errors.count)}
                hint={t.t(`RecurringEditor.countHint`)}
                required
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  name="count"
                  class="w-32"
                  min={1}
                  max={RECURRING_COUNT_MAX}
                  data-e2e="recurring-count"
                  value={value.count ?? ``}
                  onInput={(e) => change({ count: wholeNumber(e.currentTarget.value) })}
                />
              </Field>
            )}
            <div
              class="flex flex-col gap-1 text-sm"
              aria-live="polite"
              data-e2e="recurring-sentence"
            >
              <p class="font-medium">{sentence ?? t.t(`RecurringEditor.chooseDays`)}</p>
              {preview.length > 0 && (
                <p class="text-muted" data-e2e="recurring-preview">
                  {t.t(`RecurringEditor.nextDates`, {
                    dates: preview.map((date) => dayLabel(date, locale)).join(`, `),
                  })}
                </p>
              )}
            </div>
          </fieldset>
          {props.plan
            ? <PlanRefusalNotice groupId={group.id} refusal={props.plan} navigate={navigate} />
            : <ErrorState message={messageText(t, errors.form)} />}
          {showFooter && (
            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                href={props.back.href}
                navigate={navigate}
                variant="ghost"
                class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                data-e2e="recurring-cancel"
              >
                {t.t(`TransactionEditor.cancel`)}
              </Button>
              <Button
                type="submit"
                class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                data-e2e="recurring-save"
                busy={saving}
                busyLabel={t.t(`RecurringEditor.saving`)}
              >
                {rule ? t.t(`RecurringEditor.save`) : t.t(`RecurringEditor.create`)}
              </Button>
            </div>
          )}
        </Stack>
      </ScreenForm>
    </Stack>
  )
}

/** A viewer's page: the rule as text, with no form, no Save and no menu. */
function ReadOnly(props: Shown): JSX.Element {
  const { group, rule, navigate } = props
  const t = useAppText()
  const rows: [string, ComponentChildren][] = rule
    ? [
      [
        t.t(`TransactionEditor.amount`),
        <EntryAmount key="amount" amount={rule.amount} currency={rule.currency} />,
      ],
      [t.t(`TransactionEditor.account`), <bdi key="account">{rule.accountName}</bdi>],
      [t.t(`TransactionEditor.category`), <bdi key="category">{rule.categoryLabel}</bdi>],
      ...(props.value.memo
        ? [[t.t(`TransactionEditor.memoLabel`), <bdi key="memo">{props.value.memo}</bdi>]] as [
          string,
          ComponentChildren,
        ][]
        : []),
      [t.t(`RecurringEditor.repeat`), rule.repeat],
    ]
    : []
  return (
    <Stack gap="xl">
      <PageHeader
        back={props.back}
        navigate={navigate}
        title={rule ? t.t(`RecurringEditor.title`) : t.t(`RecurringEditor.new`)}
        titleDataE2E="recurring-editor-title"
        subtitle={group.name}
      />
      <p class="text-sm text-muted" data-e2e="recurring-read-only">
        {t.t(`Recurring.readOnly`)}
      </p>
      {rule && (
        <Card class={FORM_WIDTH}>
          <dl class="divide-y divide-subtle" data-e2e="recurring-facts">
            {rows.map(([label, shown]) => (
              <div key={label} class="flex min-h-14 flex-col gap-1 px-4 py-3 sm:px-6">
                <dt class="text-sm text-muted">{label}</dt>
                <dd class="break-words font-medium">{shown}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </Stack>
  )
}
