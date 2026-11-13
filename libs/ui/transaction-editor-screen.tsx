import type { ComponentChildren, JSX } from "preact"
import { useEffect, useMemo, useRef } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { Card } from "@spy4x/preact-ui/card"
import { CurrencyField } from "@spy4x/preact-ui/currency-field"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Field } from "@spy4x/preact-ui/field"
import { useFormat } from "@spy4x/preact-ui/format"
import { Input } from "@spy4x/preact-ui/input"
import { Kbd } from "@spy4x/preact-ui/kbd"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Stack } from "@spy4x/preact-ui/layout"
import { MoneyInput } from "@spy4x/preact-ui/money-input"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { Rich } from "@spy4x/preact-ui/i18n"
import { SegmentedControl } from "@spy4x/preact-ui/segmented-control"
import { dayLabel } from "@spy4x/time/locale"
import { currencyOptions, formatMoney } from "@spy4x/platform/universal/money-core"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { PlanRefusal } from "@domain/billing"
import { CategoryKind } from "@domain/categories"
import { amountDecimals, COINS } from "@domain/money"
import {
  TRANSACTION_AMOUNT_MAX,
  TRANSACTION_MEMO_MAX_LENGTH,
  TransactionKind,
} from "@domain/transactions"
import { ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import { FORM_WIDTH, useWaited } from "./tag-editor-screen.tsx"
import {
  categoryLabel,
  EntryAmount,
  type TransactionAccount,
  type TransactionCategory,
  type TransactionRow,
} from "./transaction-parts.tsx"
import { type Navigate, ScreenForm, TRANSACTION_PATHS } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

/** What the editor's fields show: what the person typed, or the entry as saved. */
export interface TransactionEditorValue {
  kind: TransactionKind
  /** Positive, in `currency`'s smallest unit; `null` while empty. */
  amount: number | null
  currency: string | null
  /** What the account was charged, when the currencies differ and the person typed it. */
  accountAmount: number | null
  accountId: string | null
  categoryId: string | null
  date: string
  memo: string
}

/** The editor's errors, per field and for the form. */
export interface TransactionEditorErrors {
  amount: Message | null
  currency: Message | null
  accountAmount: Message | null
  account: Message | null
  category: Message | null
  date: Message | null
  memo: Message | null
  form: Message | null
  /** The server has no rate for the date: the account amount is now required. */
  noRate: boolean
  plan: PlanRefusal | null
}

export interface TransactionEditorScreenProps {
  group: NotesGroup | null
  loading: boolean
  /** The entry is not in this household: gone, never there, or another household's. */
  notFound: boolean
  /** The entry being edited, as saved, or `null` on the create page. */
  transaction: TransactionRow | null
  /** "Added by Anna, 12 Nov" for a saved entry. */
  stamp?: ComponentChildren
  value: TransactionEditorValue
  onChange?: (next: Partial<TransactionEditorValue>) => void
  errors: TransactionEditorErrors
  accounts: readonly TransactionAccount[]
  categories: readonly TransactionCategory[]
  saving: boolean
  /** The fields differ from the saved entry; an existing entry shows Save only then. */
  dirty: boolean
  onSave?: () => void
  onDelete?: () => void
  /** A delete is in flight. */
  pending?: boolean
  /** Where Back and Cancel go: the page the person came from. */
  backHref?: string
  recentCurrencies?: readonly string[]
  /** The device has no network: the write waits in the queue. */
  offline?: boolean
  navigate?: Navigate
}

/**
 * One transaction on a page of its own, at `/transactions/new` (the quick entry) and
 * `/transactions/:id`. The amount takes focus; every other field is prefilled and shown, so typing
 * an amount and pressing Enter adds the entry. A viewer sees the fields as text.
 */
export function TransactionEditorScreen(props: TransactionEditorScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  const back = { href: props.backHref ?? TRANSACTION_PATHS.list, label: t.t(`Transactions.back`) }
  const waited = useWaited(props.loading)
  if (!group || props.notFound || (props.loading && !props.transaction)) {
    return (
      <Page>
        <PageHeader
          back={back}
          navigate={navigate}
          title={t.t(`TransactionEditor.title`)}
          subtitle={group?.name}
        />
        {!group && !props.loading && <NoGroup loading={false} navigate={navigate} />}
        {group && props.notFound && (
          <div data-e2e="transaction-not-found">
            <ListEmpty
              title={t.t(`TransactionEditor.notFound`)}
              description={messageText(t, props.errors.form) ??
                t.t(`TransactionEditor.notFoundHint`)}
              action={
                <Button href={TRANSACTION_PATHS.list} navigate={navigate} variant="outline">
                  {t.t(`Transactions.back`)}
                </Button>
              }
            />
          </div>
        )}
        {props.loading && waited && (
          <div data-e2e="transaction-loading">
            <p role="status" class="sr-only">{t.t(`TransactionEditor.loading`)}</p>
            <LoadingSkeleton rows={4} class={FORM_WIDTH} />
          </div>
        )}
      </Page>
    )
  }
  return group.canWrite
    ? <Editor {...props} group={group} back={back} />
    : <ReadOnly {...props} group={group} back={back} />
}

type Shown = TransactionEditorScreenProps & {
  group: NotesGroup
  back: { href: string; label: string }
}

/** The kind's two segments. */
function kindOptions(t: Translator<string>) {
  return [
    { value: String(TransactionKind.EXPENSE), label: t.t(`TransactionEditor.expense`) },
    { value: String(TransactionKind.INCOME), label: t.t(`TransactionEditor.income`) },
  ]
}

/**
 * The categories an entry of `kind` may take, for the select: an expense lists expense
 * categories; an income lists income ones, then the expense ones under "Refund to an expense
 * category". Archived ones are left out unless the entry already has one.
 */
export function categoryGroups(
  kind: TransactionKind,
  categories: readonly TransactionCategory[],
  chosen: string | null,
): { own: { id: string; label: string }[]; refund: { id: string; label: string }[] } {
  const listed = categories
    .filter((category) => !category.archived || category.id === chosen)
    .map((category) => ({ ...category, label: categoryLabel(category, categories) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const of = (kindOf: CategoryKind) =>
    listed.filter((category) => category.kind === kindOf).map(({ id, label }) => ({ id, label }))
  if (kind === TransactionKind.EXPENSE) return { own: of(CategoryKind.EXPENSE), refund: [] }
  return { own: of(CategoryKind.INCOME), refund: of(CategoryKind.EXPENSE) }
}

/** "1 EUR = 1.0842 USD", from the two amounts: the rate is never stored. */
function rateText(
  amount: number,
  currency: string,
  accountAmount: number,
  accountCurrency: string,
  locale: string,
): string {
  const rate = (Math.abs(accountAmount) / 10 ** amountDecimals(accountCurrency)) /
    (Math.abs(amount) / 10 ** amountDecimals(currency))
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(rate)
}

function Editor(props: Shown): JSX.Element {
  const { group, transaction, value, errors, saving, navigate } = props
  const t = useAppText()
  const { locale } = useFormat()
  const change = (next: Partial<TransactionEditorValue>) => props.onChange?.(next)
  const account = props.accounts.find((candidate) => candidate.id === value.accountId)
  const accountCurrency = account?.currency ?? null
  const converted = value.currency !== null && accountCurrency !== null &&
    value.currency !== accountCurrency
  const options = useMemo(() => currencyOptions(t.language, COINS), [t.language])
  const groups = categoryGroups(value.kind, props.categories, value.categoryId)
  const chosenCategory = props.categories.find((category) => category.id === value.categoryId)
  const refund = value.kind === TransactionKind.INCOME &&
    chosenCategory?.kind === CategoryKind.EXPENSE

  // The amount takes focus when the page opens, so the quick entry is: type, Enter.
  const amountBox = useRef<HTMLDivElement>(null)
  const fields = useRef<HTMLDivElement>(null)
  useEffect(() => {
    amountBox.current?.querySelector("input")?.focus()
  }, [])
  // A refused save moves focus to the first field it newly names, top to bottom. A field whose
  // error stays, or one that clears while the person types, leaves the focus where it is.
  const named = ([
    [errors.amount, "transaction-amount"],
    [errors.accountAmount, "transaction-account-amount"],
    [errors.account, "transaction-account"],
    [errors.category, "transaction-category"],
    [errors.memo, "transaction-memo"],
  ] as const).filter(([error]) => error).map(([, id]) => id)
  const before = useRef<readonly string[]>([])
  useEffect(() => {
    const fresh = named.find((id) => !before.current.includes(id))
    before.current = named
    if (fresh) fields.current?.querySelector<HTMLElement>(`#${fresh}`)?.focus()
  }, [named.join(" ")])

  const accountName = account?.name ?? ""
  const noRateText = errors.noRate && converted
    ? t.t(`TransactionMessages.noRate`, {
      currency: value.currency!,
      date: value.date,
      account: accountName,
      accountCurrency: accountCurrency!,
    })
    : null
  const saved = transaction !== null && value.accountId === transaction.accountId &&
    value.currency === transaction.currency && value.amount === Math.abs(transaction.amount) &&
    value.date === transaction.date
  const accountAmountHint = !converted
    ? null
    : value.accountAmount !== null && value.amount
    ? t.t(`TransactionEditor.ownRate`, {
      currency: value.currency!,
      accountCurrency: accountCurrency!,
      rate: rateText(value.amount, value.currency!, value.accountAmount, accountCurrency!, locale),
    })
    : saved && transaction.queued && transaction.converted
    ? t.t(`Transactions.convertLater`)
    : saved && transaction.converted && transaction.accountAmount !== 0
    ? t.t(`TransactionEditor.convertedAt`, {
      date: transaction.date,
      currency: transaction.currency,
      accountCurrency: accountCurrency!,
      rate: rateText(
        transaction.amount,
        transaction.currency,
        transaction.accountAmount,
        accountCurrency!,
        locale,
      ),
    })
    : t.t(`TransactionEditor.accountAmountHint`, { date: value.date })

  const showFooter = transaction === null || props.dirty
  const menu = transaction && props.onDelete && (
    <DropdownItem
      onClick={props.onDelete}
      disabled={props.pending}
      danger
      dataE2E="transaction-delete"
    >
      {t.t(`TransactionEditor.delete`)}
    </DropdownItem>
  )
  const memoLength = value.memo.trim().length
  return (
    <Page>
      <PageHeader
        back={props.back}
        navigate={navigate}
        title={transaction ? t.t(`TransactionEditor.title`) : t.t(`TransactionEditor.new`)}
        titleDataE2E="transaction-title"
        subtitle={props.stamp ?? group.name}
        menuDataE2E="transaction-editor-menu"
        menu={menu}
      />
      {props.offline && (
        <div data-e2e="transaction-offline">
          <Notice title={t.t(`TransactionEditor.offlineTitle`)}>
            {t.t(`TransactionEditor.offline`)}
          </Notice>
        </div>
      )}
      <ScreenForm
        pending={saving}
        onSubmit={() => {
          if (transaction === null || props.dirty) props.onSave?.()
        }}
      >
        <Stack class={FORM_WIDTH}>
          <div ref={fields} class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              {/* The group is named by its own label; this is the same word, for sight. */}
              <span class="text-sm font-medium" aria-hidden="true">
                {t.t(`TransactionEditor.kind`)}
              </span>
              <div data-e2e="transaction-kind">
                <SegmentedControl
                  ariaLabel={t.t(`TransactionEditor.kind`)}
                  options={kindOptions(t)}
                  value={String(value.kind)}
                  onChange={(kind) => change({ kind: Number(kind) as TransactionKind })}
                />
              </div>
            </div>
            <div data-e2e="transaction-amount-field" ref={amountBox}>
              <Field
                id="transaction-amount"
                label={t.t(`TransactionEditor.amount`)}
                error={messageText(t, errors.amount)}
                hint={value.amount === null ? t.t(`TransactionEditor.amountHint`) : undefined}
                required
              >
                {(wiring) => (
                  <MoneyInput
                    id={wiring.id}
                    aria-describedby={wiring["aria-describedby"]}
                    aria-invalid={errors.amount !== null}
                    name="amount"
                    class="text-lg"
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
            </div>
            <Field
              id="transaction-currency"
              label={t.t(`TransactionEditor.currency`)}
              error={messageText(t, errors.currency)}
              hint={t.t(`TransactionEditor.currencyHint`)}
              required
            >
              {(wiring) => (
                <div data-e2e="transaction-currency-field">
                  <CurrencyField
                    id={wiring.id}
                    aria-describedby={wiring["aria-describedby"]}
                    value={value.currency}
                    onChange={(currency) => change({ currency })}
                    options={options}
                    recent={props.recentCurrencies}
                  />
                </div>
              )}
            </Field>
            {converted && (
              <div data-e2e="transaction-account-amount-field">
                <Field
                  id="transaction-account-amount"
                  label={t.t(`TransactionEditor.accountAmount`, { currency: accountCurrency! })}
                  error={noRateText ?? messageText(t, errors.accountAmount)}
                  hint={accountAmountHint}
                >
                  {(wiring) => (
                    <MoneyInput
                      id={wiring.id}
                      aria-describedby={wiring["aria-describedby"]}
                      aria-invalid={errors.accountAmount !== null}
                      name="accountAmount"
                      value={value.accountAmount}
                      onChange={(accountAmount) => change({ accountAmount })}
                      currency={accountCurrency!}
                      decimals={amountDecimals(accountCurrency!)}
                      min={0}
                      max={TRANSACTION_AMOUNT_MAX}
                      required={errors.noRate}
                      invalidMessage={t.t(`AccountEditor.amountInvalid`)}
                      rangeMessage={() => t.t(`AccountEditor.amountTooLarge`)}
                      decimalsMessage={(decimals) =>
                        decimals === 0
                          ? t.t(`AccountEditor.amountNoDecimals`, { currency: accountCurrency! })
                          : t.t(`AccountEditor.amountDecimals`, {
                            count: decimals,
                            currency: accountCurrency!,
                          })}
                    />
                  )}
                </Field>
              </div>
            )}
            <Field
              id="transaction-account"
              label={t.t(`TransactionEditor.account`)}
              error={messageText(t, errors.account)}
              required
            >
              <select
                class="pc-select"
                name="accountId"
                data-e2e="transaction-account"
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
              id="transaction-category"
              label={t.t(`TransactionEditor.category`)}
              error={messageText(t, errors.category)}
              hint={refund ? t.t(`TransactionEditor.refundHint`) : undefined}
              required
            >
              <select
                class="pc-select"
                name="categoryId"
                data-e2e="transaction-category"
                value={value.categoryId ?? ""}
                onChange={(e) => change({ categoryId: e.currentTarget.value || null })}
                required
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
            </Field>
            <Field
              id="transaction-date"
              label={t.t(`TransactionEditor.date`)}
              error={messageText(t, errors.date)}
              required
            >
              <Input
                type="date"
                name="date"
                class="min-w-0"
                data-e2e="transaction-date"
                value={value.date}
                onChange={(e) => e.currentTarget.value && change({ date: e.currentTarget.value })}
                required
              />
            </Field>
            <Field
              id="transaction-memo"
              label={t.t(`TransactionEditor.memo`)}
              error={messageText(t, errors.memo)}
              hint={memoLength >= TRANSACTION_MEMO_MAX_LENGTH - 50
                ? t.t(`TransactionEditor.memoCount`, {
                  count: memoLength,
                  max: TRANSACTION_MEMO_MAX_LENGTH,
                })
                : undefined}
            >
              <Input
                name="memo"
                autocomplete="off"
                data-e2e="transaction-memo"
                value={value.memo}
                onInput={(e) => change({ memo: e.currentTarget.value })}
              />
            </Field>
          </div>
          {errors.plan
            ? <PlanRefusalNotice groupId={group.id} refusal={errors.plan} navigate={navigate} />
            : <ErrorState message={messageText(t, errors.form)} />}
          {showFooter && (
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              {transaction === null && (
                <p
                  class="hidden text-sm text-muted sm:me-auto sm:block"
                  data-e2e="transaction-keys"
                >
                  <Rich
                    parts={t.parts(`TransactionEditor.enterHint`, { key: `` })}
                    tags={{ key: () => <Kbd keys="enter" /> }}
                  />
                </p>
              )}
              <div class="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  href={props.back.href}
                  navigate={navigate}
                  variant="ghost"
                  class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                  data-e2e="transaction-cancel"
                >
                  {t.t(`TransactionEditor.cancel`)}
                </Button>
                <Button
                  type="submit"
                  class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                  data-e2e="transaction-save"
                  busy={saving}
                  busyLabel={transaction
                    ? t.t(`TransactionEditor.saving`)
                    : t.t(`TransactionEditor.adding`)}
                >
                  {transaction ? t.t(`TransactionEditor.save`) : t.t(`Transactions.add`)}
                </Button>
              </div>
            </div>
          )}
        </Stack>
      </ScreenForm>
    </Page>
  )
}

/** A viewer's page: the entry's fields as text, with no form, no Save and no menu. */
function ReadOnly(props: Shown): JSX.Element {
  const { group, transaction, value, navigate } = props
  const t = useAppText()
  const { locale } = useFormat()
  const account = props.accounts.find((candidate) => candidate.id === value.accountId)
  const category = props.categories.find((candidate) => candidate.id === value.categoryId)
  const rows: [string, ComponentChildren][] = transaction
    ? [
      [
        t.t(`TransactionEditor.kind`),
        value.kind === TransactionKind.INCOME
          ? t.t(`TransactionEditor.income`)
          : t.t(`TransactionEditor.expense`),
      ],
      [
        t.t(`TransactionEditor.amount`),
        <EntryAmount key="amount" amount={transaction.amount} currency={transaction.currency} />,
      ],
      ...(transaction.currency !== transaction.accountCurrency
        ? [[
          t.t(`TransactionEditor.accountAmount`, { currency: transaction.accountCurrency }),
          formatMoney(transaction.accountAmount, transaction.accountCurrency, locale, {
            decimals: amountDecimals(transaction.accountCurrency),
          }),
        ] as [string, ComponentChildren]]
        : []),
      [
        t.t(`TransactionEditor.account`),
        <bdi key="account">{account?.name ?? transaction.accountName}</bdi>,
      ],
      [
        t.t(`TransactionEditor.category`),
        <bdi key="category">
          {category ? categoryLabel(category, props.categories) : transaction.categoryName}
        </bdi>,
      ],
      [t.t(`TransactionEditor.date`), dayLabel(value.date, locale)],
      ...(value.memo
        ? [[t.t(`TransactionEditor.memoLabel`), <bdi key="memo">{value.memo}</bdi>]] as [
          string,
          ComponentChildren,
        ][]
        : []),
    ]
    : []
  return (
    <Page>
      <PageHeader
        back={props.back}
        navigate={navigate}
        title={transaction ? t.t(`TransactionEditor.title`) : t.t(`TransactionEditor.new`)}
        titleDataE2E="transaction-title"
        subtitle={props.stamp ?? group.name}
      />
      <p class="text-sm text-muted" data-e2e="transaction-read-only">
        {transaction
          ? t.t(`TransactionEditor.readOnly`)
          : t.t(`TransactionEditor.readOnlyNew`, { household: group.name })}
      </p>
      {transaction && (
        <Card class={FORM_WIDTH}>
          <dl class="divide-y divide-subtle" data-e2e="transaction-facts">
            {rows.map(([label, shown]) => (
              <div key={label} class="flex min-h-14 flex-col gap-1 px-4 py-3 sm:px-6">
                <dt class="text-sm text-muted">{label}</dt>
                <dd class="break-words font-medium">{shown}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </Page>
  )
}

/** The page's content, in the column the app's frame sets: never a width of its own. */
function Page({ children }: { children?: ComponentChildren }): JSX.Element {
  return <Stack gap="xl">{children}</Stack>
}
