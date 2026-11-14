import type { ComponentChildren, JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { Card } from "@spy4x/preact-ui/card"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Field } from "@spy4x/preact-ui/field"
import { useFormat } from "@spy4x/preact-ui/format"
import { Input } from "@spy4x/preact-ui/input"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Stack } from "@spy4x/preact-ui/layout"
import { MoneyInput } from "@spy4x/preact-ui/money-input"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { SegmentedControl } from "@spy4x/preact-ui/segmented-control"
import { dayLabel } from "@spy4x/time/locale"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { PlanRefusal } from "@domain/billing"
import { amountDecimals } from "@domain/money"
import { TransactionKind } from "@domain/transactions"
import { TRANSFER_AMOUNT_MAX, TRANSFER_MEMO_MAX_LENGTH } from "@domain/transfers"
import { ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import { FORM_WIDTH, useWaited } from "./tag-editor-screen.tsx"
import { type TransactionAccount, type TransferRow, TRANSFERS_KIND } from "./transaction-parts.tsx"
import { impliedRate, moneyText } from "./transfer-parts.tsx"
import { ACCOUNT_PATHS, type Navigate, ScreenForm, TRANSACTION_PATHS } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

/** What the transfer editor's fields show: what the person typed, or the transfer as saved. */
export interface TransferEditorValue {
  fromAccountId: string | null
  toAccountId: string | null
  /** Positive, in the from account's smallest unit; `null` while empty. */
  sentAmount: number | null
  /** What the to account received, when the currencies differ and the person typed it. */
  receivedAmount: number | null
  /** `YYYY-MM-DD`. */
  date: string
  memo: string
}

/** The transfer editor's errors, per field and for the form. */
export interface TransferEditorErrors {
  from: Message | null
  to: Message | null
  sentAmount: Message | null
  receivedAmount: Message | null
  date: Message | null
  memo: Message | null
  form: Message | null
  /** The server has no rate for the date: the received amount is now required. */
  noRate: boolean
  plan: PlanRefusal | null
}

export interface TransferEditorScreenProps {
  group: NotesGroup | null
  loading: boolean
  /** The transfer is not in this household: gone, never there, or another household's. */
  notFound: boolean
  /** The transfer being edited, as saved, or `null` on the create page. */
  transfer: TransferRow | null
  /** "Added by Anna, 12 Nov" for a saved transfer. */
  stamp?: ComponentChildren
  value: TransferEditorValue
  onChange?: (next: Partial<TransferEditorValue>) => void
  errors: TransferEditorErrors
  accounts: readonly TransactionAccount[]
  saving: boolean
  /** The fields differ from the saved transfer; an existing transfer shows Save only then. */
  dirty: boolean
  onSave?: () => void
  onDelete?: () => void
  /** A delete is in flight. */
  pending?: boolean
  /** Where Back and Cancel go: the page the person came from. */
  backHref?: string
  /** The device has no network: a transfer can be read, not written. */
  offline?: boolean
  /**
   * The create page's kind control chose Expense or Income: the view moves to the transaction
   * editor with what was typed. Without it, the page has no kind control (an existing transfer).
   */
  onKind?: (kind: TransactionKind) => void
  navigate?: Navigate
}

/**
 * One transfer on a page of its own, at `/transfers/new` and `/transfers/:id`: money moved between
 * two of the household's own accounts. The received amount shows only across currencies, and may
 * stay empty for the server to convert at the date's rate. A viewer sees the fields as text.
 */
export function TransferEditorScreen(props: TransferEditorScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  const back = { href: props.backHref ?? TRANSACTION_PATHS.list, label: t.t(`Transactions.back`) }
  const waited = useWaited(props.loading)
  const title = props.transfer ? t.t(`TransferEditor.title`) : t.t(`TransferEditor.new`)
  const active = props.accounts.filter((account) => !account.archived)
  const tooFew = group?.canWrite && props.transfer === null && !props.loading && active.length < 2
  if (!group || props.notFound || props.loading || tooFew) {
    return (
      <Page>
        <PageHeader
          back={back}
          navigate={navigate}
          title={title}
          titleDataE2E="transfer-title"
          subtitle={group?.name}
        />
        {!group && !props.loading && <NoGroup loading={false} navigate={navigate} />}
        {group && props.notFound && (
          <div data-e2e="transfer-not-found">
            <ListEmpty
              title={t.t(`TransferEditor.notFound`)}
              description={messageText(t, props.errors.form) ??
                t.t(`TransferEditor.notFoundHint`)}
              action={
                <Button href={TRANSACTION_PATHS.list} navigate={navigate} variant="outline">
                  {t.t(`Transactions.back`)}
                </Button>
              }
            />
          </div>
        )}
        {group && !props.notFound && tooFew && (
          <div data-e2e="transfer-needs-accounts">
            <ListEmpty
              title={t.t(`TransferEditor.needAccounts`)}
              description={t.t(`TransferEditor.needAccountsHint`)}
              action={
                <Button href={ACCOUNT_PATHS.new} navigate={navigate} variant="secondary">
                  {t.t(`Transactions.addAccount`)}
                </Button>
              }
            />
          </div>
        )}
        {props.loading && waited && (
          <div data-e2e="transfer-loading">
            <p role="status" class="sr-only">{t.t(`TransferEditor.loading`)}</p>
            <LoadingSkeleton rows={4} class={FORM_WIDTH} />
          </div>
        )}
      </Page>
    )
  }
  return group.canWrite
    ? <Editor {...props} group={group} back={back} title={title} />
    : <ReadOnly {...props} group={group} back={back} title={title} />
}

type Shown = TransferEditorScreenProps & {
  group: NotesGroup
  back: { href: string; label: string }
  title: string
}

/** The kind control's three segments: the transaction kinds and Transfer. */
function kindOptions(t: Translator<string>) {
  return [
    { value: String(TransactionKind.EXPENSE), label: t.t(`TransactionEditor.expense`) },
    { value: String(TransactionKind.INCOME), label: t.t(`TransactionEditor.income`) },
    { value: String(TRANSFERS_KIND), label: t.t(`TransactionEditor.transfer`) },
  ]
}

/** How long typing must pause before the rate line is announced. */
const SETTLE_MS = 700

/** `value`, once it has not changed for {@link SETTLE_MS}: a screen reader hears the last one only. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

/**
 * The muted line under the amounts across currencies: the rate the two typed amounts imply, the
 * rate a saved converted transfer used, or that the server converts on save.
 */
export function rateLine(
  t: Translator<string>,
  { value, transfer, from, to, locale }: {
    value: TransferEditorValue
    transfer: TransferRow | null
    from: TransactionAccount
    to: TransactionAccount
    locale: string
  },
): string {
  if (value.sentAmount && value.receivedAmount) {
    return t.t(`TransferEditor.ownRate`, {
      from: from.currency,
      to: to.currency,
      rate: impliedRate(value.sentAmount, from.currency, value.receivedAmount, to.currency, locale),
    })
  }
  const saved = transfer !== null && transfer.converted &&
    value.fromAccountId === transfer.fromAccountId && value.toAccountId === transfer.toAccountId &&
    value.sentAmount === transfer.sentAmount && value.date === transfer.date
  return saved
    ? t.t(`TransferEditor.convertedAt`, {
      date: dayLabel(transfer.date, locale),
      from: from.currency,
      to: to.currency,
      rate: impliedRate(
        transfer.sentAmount,
        from.currency,
        transfer.receivedAmount,
        to.currency,
        locale,
      ),
    })
    : t.t(`TransferEditor.convertLater`, { date: dayLabel(value.date, locale) })
}

/** The amount field's messages, in the currency it is typed in. */
function amountMessages(t: Translator<string>, currency: string) {
  return {
    invalidMessage: t.t(`AccountEditor.amountInvalid`),
    rangeMessage: () => t.t(`AccountEditor.amountTooLarge`),
    decimalsMessage: (decimals: number) =>
      decimals === 0
        ? t.t(`AccountEditor.amountNoDecimals`, { currency })
        : t.t(`AccountEditor.amountDecimals`, { count: decimals, currency }),
  }
}

function Editor(props: Shown): JSX.Element {
  const { group, transfer, value, errors, saving, navigate } = props
  const t = useAppText()
  const { locale } = useFormat()
  const change = (next: Partial<TransferEditorValue>) => props.onChange?.(next)
  const from = props.accounts.find((account) => account.id === value.fromAccountId)
  const to = props.accounts.find((account) => account.id === value.toAccountId)
  const across = from !== undefined && to !== undefined && from.currency !== to.currency
  const listed = (chosen: string | null) =>
    props.accounts.filter((account) => !account.archived || account.id === chosen)
  // Once the server said it has no rate, "converted when you save" is no longer true: the line
  // returns only when both amounts are typed and it names the person's own rate.
  const rate = across && !(errors.noRate && value.receivedAmount === null)
    ? rateLine(t, { value, transfer, from, to, locale })
    : ""
  const settledRate = useSettled(rate)

  // The first field still empty takes focus when the page opens: From, To, then the amount.
  const fields = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const first = value.fromAccountId === null
      ? "transfer-from"
      : value.toAccountId === null
      ? "transfer-to"
      : "transfer-sent"
    fields.current?.querySelector<HTMLElement>(`#${first}`)?.focus()
  }, [])
  // A refused save moves focus to the first field it newly names, top to bottom.
  const named = ([
    [errors.from, "transfer-from"],
    [errors.to, "transfer-to"],
    [errors.sentAmount, "transfer-sent"],
    [errors.receivedAmount, "transfer-received"],
    [errors.memo, "transfer-memo"],
  ] as const).filter(([error]) => error).map(([, id]) => id)
  const before = useRef<readonly string[]>([])
  useEffect(() => {
    const fresh = named.find((id) => !before.current.includes(id))
    before.current = named
    if (fresh) fields.current?.querySelector<HTMLElement>(`#${fresh}`)?.focus()
  }, [named.join(" ")])

  const noRateText = errors.noRate && across
    ? t.t(`TransferMessages.noRate`, {
      currency: from.currency,
      date: dayLabel(value.date, locale),
      account: to.name,
      toCurrency: to.currency,
    })
    : null
  const offline = props.offline ?? false
  const showFooter = transfer === null || props.dirty
  const menu = transfer && props.onDelete && !offline && (
    <DropdownItem
      onClick={props.onDelete}
      disabled={props.pending}
      danger
      dataE2E="transfer-delete"
    >
      {t.t(`TransferEditor.delete`)}
    </DropdownItem>
  )
  const memoLength = value.memo.trim().length
  return (
    <Page>
      <PageHeader
        back={props.back}
        navigate={navigate}
        title={props.title}
        titleDataE2E="transfer-title"
        subtitle={props.stamp ?? group.name}
        menuDataE2E="transfer-editor-menu"
        menu={menu}
      />
      {offline && (
        <div data-e2e="transfer-offline">
          <Notice title={t.t(`TransactionEditor.offlineTitle`)}>
            {t.t(`TransferEditor.offline`)}
          </Notice>
        </div>
      )}
      <ScreenForm
        pending={saving}
        onSubmit={() => {
          if (!offline && (transfer === null || props.dirty)) props.onSave?.()
        }}
      >
        <Stack class={FORM_WIDTH}>
          <div ref={fields} class="flex flex-col gap-4">
            {props.onKind && (
              <div class="flex flex-col gap-2">
                {/* The group is named by its own label; this is the same word, for sight. */}
                <span class="text-sm font-medium" aria-hidden="true">
                  {t.t(`TransactionEditor.kind`)}
                </span>
                <div data-e2e="transfer-kind">
                  <SegmentedControl
                    ariaLabel={t.t(`TransactionEditor.kind`)}
                    options={kindOptions(t)}
                    value={String(TRANSFERS_KIND)}
                    onChange={(kind) => {
                      if (kind !== String(TRANSFERS_KIND)) {
                        props.onKind?.(Number(kind) as TransactionKind)
                      }
                    }}
                  />
                </div>
              </div>
            )}
            <Field
              id="transfer-from"
              label={t.t(`TransferEditor.from`)}
              error={messageText(t, errors.from)}
              required
            >
              {(wiring) => (
                <select
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  aria-invalid={errors.from !== null}
                  aria-required="true"
                  class="pc-select"
                  name="fromAccountId"
                  data-e2e="transfer-from"
                  value={value.fromAccountId ?? ""}
                  onChange={(e) => change({ fromAccountId: e.currentTarget.value || null })}
                >
                  <option value="">{t.t(`TransferEditor.chooseAccount`)}</option>
                  {listed(value.fromAccountId).map((account) => (
                    <option key={account.id} value={account.id}>
                      {`${account.name} · ${account.currency}`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              id="transfer-to"
              label={t.t(`TransferEditor.to`)}
              error={messageText(t, errors.to)}
              required
            >
              {(wiring) => (
                <select
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  aria-invalid={errors.to !== null}
                  aria-required="true"
                  class="pc-select"
                  name="toAccountId"
                  data-e2e="transfer-to"
                  value={value.toAccountId ?? ""}
                  onChange={(e) => change({ toAccountId: e.currentTarget.value || null })}
                >
                  <option value="">{t.t(`TransferEditor.chooseAccount`)}</option>
                  {listed(value.toAccountId)
                    .filter((account) => account.id !== value.fromAccountId)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {`${account.name} · ${account.currency}`}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            <div data-e2e="transfer-sent-field">
              <Field
                id="transfer-sent"
                label={from
                  ? t.t(`TransferEditor.sent`, { currency: from.currency })
                  : t.t(`TransferEditor.sentPlain`)}
                error={messageText(t, errors.sentAmount)}
                required
              >
                {(wiring) => (
                  <MoneyInput
                    id={wiring.id}
                    aria-describedby={wiring["aria-describedby"]}
                    aria-invalid={errors.sentAmount !== null}
                    name="sentAmount"
                    class="text-lg"
                    value={from ? value.sentAmount : null}
                    onChange={(sentAmount) => change({ sentAmount })}
                    currency={from?.currency ?? ""}
                    decimals={from ? amountDecimals(from.currency) : undefined}
                    disabled={!from}
                    min={0}
                    max={TRANSFER_AMOUNT_MAX}
                    placeholder="0"
                    {...amountMessages(t, from?.currency ?? "")}
                  />
                )}
              </Field>
            </div>
            {across && (
              <div class="flex flex-col gap-2">
                <div data-e2e="transfer-received-field">
                  <Field
                    id="transfer-received"
                    label={t.t(`TransferEditor.received`, { currency: to.currency })}
                    error={noRateText ?? messageText(t, errors.receivedAmount)}
                    hint={errors.noRate ? undefined : t.t(`TransferEditor.receivedHint`, {
                      date: dayLabel(value.date, locale),
                      account: to.name,
                    })}
                    required={errors.noRate}
                  >
                    {(wiring) => (
                      <MoneyInput
                        id={wiring.id}
                        aria-describedby={wiring["aria-describedby"]}
                        aria-invalid={errors.noRate || errors.receivedAmount !== null}
                        name="receivedAmount"
                        value={value.receivedAmount}
                        onChange={(receivedAmount) => change({ receivedAmount })}
                        currency={to.currency}
                        decimals={amountDecimals(to.currency)}
                        min={0}
                        max={TRANSFER_AMOUNT_MAX}
                        required={errors.noRate}
                        {...amountMessages(t, to.currency)}
                      />
                    )}
                  </Field>
                </div>
                {/* Seen at once; heard once typing stops, from the status line below. */}
                {rate && (
                  <p class="text-sm text-muted" aria-hidden="true" data-e2e="transfer-rate">
                    {rate}
                  </p>
                )}
                <p role="status" class="sr-only">{settledRate}</p>
              </div>
            )}
            <Field
              id="transfer-date"
              label={t.t(`TransactionEditor.date`)}
              error={messageText(t, errors.date)}
              required
            >
              <Input
                type="date"
                name="date"
                class="min-w-0"
                data-e2e="transfer-date"
                value={value.date}
                onChange={(e) => e.currentTarget.value && change({ date: e.currentTarget.value })}
                required
              />
            </Field>
            <Field
              id="transfer-memo"
              label={t.t(`TransactionEditor.memo`)}
              error={messageText(t, errors.memo)}
              hint={memoLength >= TRANSFER_MEMO_MAX_LENGTH - 50
                ? t.t(`TransactionEditor.memoCount`, {
                  count: memoLength,
                  max: TRANSFER_MEMO_MAX_LENGTH,
                })
                : undefined}
            >
              <Input
                name="memo"
                autocomplete="off"
                data-e2e="transfer-memo"
                value={value.memo}
                onInput={(e) => change({ memo: e.currentTarget.value })}
              />
            </Field>
          </div>
          {errors.plan
            ? <PlanRefusalNotice groupId={group.id} refusal={errors.plan} navigate={navigate} />
            : <ErrorState message={messageText(t, errors.form)} />}
          {showFooter && (
            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                href={props.back.href}
                navigate={navigate}
                variant="ghost"
                class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                data-e2e="transfer-cancel"
              >
                {t.t(`TransactionEditor.cancel`)}
              </Button>
              <Button
                type="submit"
                class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                data-e2e="transfer-save"
                disabled={offline}
                busy={saving}
                busyLabel={transfer
                  ? t.t(`TransactionEditor.saving`)
                  : t.t(`TransactionEditor.adding`)}
              >
                {transfer ? t.t(`TransferEditor.save`) : t.t(`TransferEditor.add`)}
              </Button>
            </div>
          )}
        </Stack>
      </ScreenForm>
    </Page>
  )
}

/** A viewer's page: the transfer's fields as text, with no form, no Save and no menu. */
function ReadOnly(props: Shown): JSX.Element {
  const { group, transfer, navigate } = props
  const t = useAppText()
  const { locale } = useFormat()
  const rows: [string, ComponentChildren][] = transfer
    ? [
      [t.t(`TransferEditor.from`), <bdi key="from">{transfer.fromAccountName}</bdi>],
      [t.t(`TransferEditor.to`), <bdi key="to">{transfer.toAccountName}</bdi>],
      [
        t.t(`TransferEditor.sent`, { currency: transfer.fromCurrency }),
        moneyText(transfer.sentAmount, transfer.fromCurrency, locale),
      ],
      ...(transfer.fromCurrency !== transfer.toCurrency
        ? [[
          t.t(`TransferEditor.received`, { currency: transfer.toCurrency }),
          (transfer.converted ? `≈ ` : ``) +
          moneyText(transfer.receivedAmount, transfer.toCurrency, locale),
        ] as [string, ComponentChildren]]
        : []),
      [t.t(`TransactionEditor.date`), dayLabel(transfer.date, locale)],
      ...(transfer.memo
        ? [[t.t(`TransactionEditor.memoLabel`), <bdi key="memo">{transfer.memo}</bdi>]] as [
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
        title={props.title}
        titleDataE2E="transfer-title"
        subtitle={props.stamp ?? group.name}
      />
      <p class="text-sm text-muted" data-e2e="transfer-read-only">
        {transfer
          ? t.t(`TransferEditor.readOnly`)
          : t.t(`TransferEditor.readOnlyNew`, { household: group.name })}
      </p>
      {transfer && (
        <Card class={FORM_WIDTH}>
          <dl class="divide-y divide-subtle" data-e2e="transfer-facts">
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
