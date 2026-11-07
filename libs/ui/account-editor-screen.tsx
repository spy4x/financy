import type { ComponentChildren, JSX } from "preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { CurrencyField } from "@spy4x/preact-ui/currency-field"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Field } from "@spy4x/preact-ui/field"
import { useFormat } from "@spy4x/preact-ui/format"
import { Input, Select } from "@spy4x/preact-ui/input"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Stack } from "@spy4x/preact-ui/layout"
import { MoneyDisplay } from "@spy4x/preact-ui/money-display"
import { MoneyInput } from "@spy4x/preact-ui/money-input"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import {
  currencyDecimals,
  currencyOptions,
  formatMoney,
} from "@spy4x/platform/universal/money-core"
import { ACCOUNT_AMOUNT_MAX, ACCOUNT_NAME_MAX_LENGTH, AccountKind } from "@domain/accounts"
import { ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import { type AccountRow, kindOptions } from "./account-parts.tsx"
import { FORM_WIDTH, useWaited } from "./tag-editor-screen.tsx"
import { ACCOUNT_PATHS, type Navigate, ScreenForm } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"

/** What the account's fields show: what the person typed, or the account as saved. */
export interface AccountFormValue {
  name: string
  kind: AccountKind
  /** `null` until a currency is chosen. */
  currency: string | null
  /** In the currency's smallest unit; `null` while the field is empty. */
  startingBalance: number | null
}

/**
 * The starting balance moved to currency `to`: the same amount the person sees, in `to`'s smallest
 * unit, so 12.00 USD (1200) is 12 JPY. `undefined` when `to` cannot hold it exactly (12.34 USD in
 * JPY) or it grows past the largest amount; rounding would change the amount without a word.
 * Without a currency the field shows nothing, so clearing the currency clears the amount too.
 */
export function balanceInCurrency(
  amount: number | null,
  from: string | null,
  to: string | null,
): number | null | undefined {
  if (to === null) return null
  if (amount === null || from === null) return amount
  const shift = currencyDecimals(to) - currencyDecimals(from)
  const scaled = shift >= 0 ? amount * 10 ** shift : amount / 10 ** -shift
  return Number.isSafeInteger(scaled) && Math.abs(scaled) <= ACCOUNT_AMOUNT_MAX ? scaled : undefined
}

/** The errors of the account editor: per field, and for the form as a whole. */
export interface AccountFormErrors {
  name: Message | null
  currency: Message | null
  form: Message | null
}

export interface AccountEditorScreenProps {
  /** `null` while the group is not known yet (loading), or when the person is not a member. */
  group: NotesGroup | null
  /** The group, or the edited account, is still being read. */
  loading: boolean
  /** The account is not in this household: gone, never there, or another household's. */
  notFound: boolean
  /** The account being edited, as saved, or `null` on the create page. */
  account: AccountRow | null
  value: AccountFormValue
  onChange?: (value: AccountFormValue) => void
  errors: AccountFormErrors
  saving: boolean
  /** The fields differ from the saved account; an existing account shows Save only then. */
  dirty: boolean
  onSave?: () => void
  onRevert?: () => void
  /** The currencies the household's accounts use, offered first in the picker. */
  recentCurrencies?: readonly string[]
  /** A change from the page's menu is in flight. */
  pending?: boolean
  onArchive?: (archived: boolean) => void
  onSetDefault?: (isDefault: boolean) => void
  onDelete?: () => void
  /** The device has no network: changes are refused until it is back, which the page says. */
  offline?: boolean
  navigate?: Navigate
}

/**
 * One account on a page of its own, at `/accounts/new` and `/accounts/:id`: name, kind, currency and
 * starting balance, nothing else. The starting balance is typed in the chosen currency and refuses
 * more decimals than it has. A saved account's header shows its balance, and its menu holds "Make
 * default", "Archive" and "Delete". A viewer sees the fields read-only.
 */
export function AccountEditorScreen(props: AccountEditorScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  const back = { href: ACCOUNT_PATHS.list, label: t.t(`AccountEditor.back`) }
  const waited = useWaited(props.loading)
  if (!group || props.notFound || (props.loading && !props.account)) {
    return (
      <Page>
        <PageHeader
          back={back}
          navigate={navigate}
          title={t.t(`AccountEditor.title`)}
          subtitle={group?.name}
        />
        {!group && !props.loading && <NoGroup loading={false} navigate={navigate} />}
        {group && props.notFound && (
          <div data-e2e="account-not-found">
            <ListEmpty
              title={t.t(`AccountEditor.notFound`)}
              description={messageText(t, props.errors.form) ?? t.t(`AccountEditor.notFoundHint`)}
              action={
                <Button href={ACCOUNT_PATHS.list} navigate={navigate} variant="outline">
                  {t.t(`AccountEditor.back`)}
                </Button>
              }
            />
          </div>
        )}
        {props.loading && waited && (
          <div data-e2e="account-loading">
            <p role="status" class="sr-only">{t.t(`AccountEditor.loading`)}</p>
            <LoadingSkeleton rows={2} class={FORM_WIDTH} />
          </div>
        )}
      </Page>
    )
  }
  return <Editor {...props} group={group} />
}

function Editor(props: AccountEditorScreenProps & { group: NotesGroup }): JSX.Element {
  const { group, account, value, onChange, errors, saving, navigate } = props
  const t = useAppText()
  const canWrite = group.canWrite
  const name = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (errors.name) name.current?.focus()
  }, [errors.name])
  const options = useMemo(() => currencyOptions(t.language, []), [t.language])
  const { locale } = useFormat()
  /** Says why a currency change emptied the starting balance, until the person types one. */
  const [cleared, setCleared] = useState<string | null>(null)
  function changeCurrency(currency: string | null): void {
    const { startingBalance: amount, currency: from } = value
    const kept = balanceInCurrency(amount, from, currency)
    setCleared(
      kept === undefined && amount !== null && from !== null && currency !== null
        ? t.t(`AccountEditor.amountCleared`, {
          amount: formatMoney(amount, from, locale),
          currency,
        })
        : null,
    )
    onChange?.({ ...value, currency, startingBalance: kept ?? null })
  }
  const showFooter = canWrite && (account === null || props.dirty)
  const menu = canWrite && account && (
    <>
      {!account.archived && props.onSetDefault && (
        <DropdownItem
          onClick={() => props.onSetDefault!(!account.isDefault)}
          disabled={props.pending}
          dataE2E="account-editor-default"
        >
          {account.isDefault ? t.t(`Accounts.clearDefault`) : t.t(`Accounts.makeDefault`)}
        </DropdownItem>
      )}
      {props.onArchive && (
        <DropdownItem
          onClick={() => props.onArchive!(!account.archived)}
          disabled={props.pending}
          dataE2E="account-editor-archive"
        >
          {account.archived ? t.t(`Accounts.unarchive`) : t.t(`Accounts.archive`)}
        </DropdownItem>
      )}
      {props.onDelete && (
        <DropdownItem
          onClick={props.onDelete}
          disabled={props.pending}
          danger
          dataE2E="account-editor-delete"
        >
          {t.t(`Accounts.delete`)}
        </DropdownItem>
      )}
    </>
  )
  return (
    <Page>
      <PageHeader
        back={{ href: ACCOUNT_PATHS.list, label: t.t(`AccountEditor.back`) }}
        navigate={navigate}
        title={account ? account.name : t.t(`AccountEditor.new`)}
        titleDataE2E="account-title"
        subtitle={account ? <Summary account={account} /> : group.name}
        subtitleDataE2E="account-summary"
        menuDataE2E="account-editor-menu"
        menu={menu}
      />
      {canWrite && props.offline && (
        <div data-e2e="account-offline">
          <Notice title={t.t(`AccountEditor.offlineTitle`)}>{t.t(`AccountEditor.offline`)}</Notice>
        </div>
      )}
      {!canWrite && (
        <p class="text-sm text-muted" data-e2e="account-read-only">
          {t.t(`Accounts.readOnly`)}
        </p>
      )}
      <ScreenForm
        pending={saving}
        onSubmit={() => {
          if (account === null || props.dirty) props.onSave?.()
        }}
      >
        <Stack class={FORM_WIDTH}>
          <fieldset disabled={!canWrite} class="contents">
            <Stack>
              <Field
                id="account-name"
                label={t.t(`AccountEditor.name`)}
                error={messageText(t, errors.name)}
                required
              >
                <Input
                  ref={name}
                  data-e2e="account-name-input"
                  name="name"
                  autocomplete="off"
                  maxLength={ACCOUNT_NAME_MAX_LENGTH}
                  placeholder={t.t(`AccountEditor.namePlaceholder`)}
                  value={value.name}
                  onInput={(e) => onChange?.({ ...value, name: e.currentTarget.value })}
                  required
                />
              </Field>
              <Field id="account-kind" label={t.t(`AccountEditor.kind`)}>
                <Select
                  name="kind"
                  data-e2e="account-kind"
                  value={String(value.kind)}
                  onChange={(e) =>
                    onChange?.({ ...value, kind: Number(e.currentTarget.value) as AccountKind })}
                  options={kindOptions(t)}
                />
              </Field>
              <Field
                id="account-currency"
                label={t.t(`AccountEditor.currency`)}
                error={messageText(t, errors.currency)}
                required
              >
                <div data-e2e="account-currency-field">
                  <CurrencyField
                    value={value.currency}
                    onChange={changeCurrency}
                    options={options}
                    recent={props.recentCurrencies}
                  />
                </div>
              </Field>
              <Field
                id="account-starting-balance"
                label={t.t(`AccountEditor.startingBalance`)}
                error={cleared}
                hint={value.currency === null
                  ? t.t(`AccountEditor.chooseCurrencyFirst`)
                  : value.kind === AccountKind.LIABILITY
                  ? t.t(`AccountEditor.liabilityHint`)
                  : t.t(`AccountEditor.startingBalanceHint`)}
              >
                <div data-e2e="account-starting-balance">
                  <MoneyInput
                    // An amount needs its currency's decimals to be drawn, so the field stays
                    // empty, and disabled, until a currency is chosen.
                    value={value.currency === null ? null : value.startingBalance}
                    onChange={(startingBalance) => {
                      setCleared(null)
                      onChange?.({ ...value, startingBalance })
                    }}
                    currency={value.currency ?? ""}
                    disabled={value.currency === null}
                    min={-ACCOUNT_AMOUNT_MAX}
                    max={ACCOUNT_AMOUNT_MAX}
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
                </div>
              </Field>
            </Stack>
          </fieldset>
          <ErrorState message={messageText(t, errors.form)} />
          {showFooter && (
            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {account
                ? (
                  <Button
                    type="button"
                    variant="ghost"
                    class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                    data-e2e="account-cancel"
                    onClick={props.onRevert}
                  >
                    {t.t(`AccountEditor.discard`)}
                  </Button>
                )
                : (
                  <Button
                    href={ACCOUNT_PATHS.list}
                    navigate={navigate}
                    variant="ghost"
                    class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                    data-e2e="account-cancel"
                  >
                    {t.t(`AccountEditor.cancel`)}
                  </Button>
                )}
              <Button
                type="submit"
                class="min-h-11 w-full sm:min-h-9 sm:w-auto"
                data-e2e="account-save"
                busy={saving}
                busyLabel={account ? t.t(`AccountEditor.saving`) : t.t(`AccountEditor.creating`)}
              >
                {account ? t.t(`AccountEditor.save`) : t.t(`AccountEditor.create`)}
              </Button>
            </div>
          )}
        </Stack>
      </ScreenForm>
    </Page>
  )
}

/** A saved account's balance, and "Default" or "Archived" when either holds. */
function Summary({ account }: { account: AccountRow }): JSX.Element {
  const t = useAppText()
  return (
    <span>
      {t.t(`AccountEditor.balance`)}{" "}
      <MoneyDisplay amount={account.balance} currency={account.currency} tone="negative" />
      {account.isDefault && ` · ${t.t(`Accounts.defaultBadge`)}`}
      {account.archived && ` · ${t.t(`Accounts.archivedBadge`)}`}
    </span>
  )
}

/** The page's content, in the column the app's frame sets: never a width of its own. */
function Page({ children }: { children?: ComponentChildren }): JSX.Element {
  return <Stack gap="xl">{children}</Stack>
}
