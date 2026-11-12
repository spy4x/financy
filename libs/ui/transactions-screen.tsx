import { type ComponentChildren, Fragment, type JSX } from "preact"
import { Button } from "@spy4x/preact-ui/button"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Field } from "@spy4x/preact-ui/field"
import { FilterBar, type FilterBarMenu } from "@spy4x/preact-ui/filter-bar"
import { useFormat, When } from "@spy4x/preact-ui/format"
import { Rich } from "@spy4x/preact-ui/i18n"
import { Input } from "@spy4x/preact-ui/input"
import { Stack } from "@spy4x/preact-ui/layout"
import { Link } from "@spy4x/preact-ui/link"
import { PageAction, PageHeader } from "@spy4x/preact-ui/page-header"
import { IconPlus } from "@spy4x/preact-icons"
import { relativeDayLabel } from "@spy4x/time/locale"
import { formatMoney } from "@spy4x/platform/universal/money-core"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { PlanRefusal } from "@domain/billing"
import { amountDecimals } from "@domain/money"
import { TRANSACTION_RESTORE_DAYS, TransactionKind } from "@domain/transactions"
import { ListCard, ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import {
  byDay,
  EntryAmount,
  filterTransactions,
  hasFilters,
  type TransactionAccount,
  type TransactionCategory,
  type TransactionFilters,
  type TransactionRow,
} from "./transaction-parts.tsx"
import { ACCOUNT_PATHS, type Navigate, TRANSACTION_PATHS } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

export interface TransactionsScreenProps {
  /** `null` while the group is not known yet (loading), or when the person is not a member. */
  group: NotesGroup | null
  /** Shown under the page header: the offline status. */
  intro?: ComponentChildren
  /** The household's live entries, newest first. */
  rows: readonly TransactionRow[]
  /** The deleted entries while that view is shown, else `null`. */
  deleted: readonly TransactionRow[] | null
  accounts: readonly TransactionAccount[]
  categories: readonly TransactionCategory[]
  loading: boolean
  /** The list was read at least once, from the server or the device's copy. */
  loaded: boolean
  /** The device has no network. With nothing read yet, the page says there is no copy. */
  offline: boolean
  listError: Message | null
  /** The plan's refusal of a restore, shown in place of `listError`. */
  listPlan?: PlanRefusal | null
  filters: TransactionFilters
  onFiltersChange?: (next: Partial<TransactionFilters>) => void
  onClearFilters?: () => void
  /** Today in the household's zone, `YYYY-MM-DD`, for the "Today" and "Yesterday" headings. */
  today: string
  /** The key that opens the new transaction, as the platform writes it ("T"). */
  newKey: string
  onShowDeleted?: (show: boolean) => void
  onRestore?: (id: string) => void
  /** The entry whose restore is in flight. */
  pendingId?: string | null
  navigate?: Navigate
}

/**
 * A household's transactions at `/transactions`: newest first, under a heading per day, with memo
 * search and the account, category, kind and date filters in the address. Each row opens the
 * entry's page. `?deleted=1` shows the deleted entries with Restore instead. A viewer sees the
 * same list without "Add transaction" or the deleted view.
 */
export function TransactionsScreen(props: TransactionsScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  if (!group) {
    return (
      <Page>
        <PageHeader title={t.t(`Transactions.title`)} />
        <NoGroup loading={props.loading} navigate={navigate} />
      </Page>
    )
  }
  const canWrite = group.canWrite
  const trash = props.deleted !== null
  return (
    <Page>
      <PageHeader
        title={trash ? t.t(`Transactions.deletedTitle`) : t.t(`Transactions.title`)}
        subtitle={group.name}
        subtitleDataE2E="transactions-group"
        back={trash ? { href: TRANSACTION_PATHS.list, label: t.t(`Transactions.back`) } : undefined}
        navigate={trash ? () => props.onShowDeleted?.(false) : navigate}
        action={canWrite && !trash && (
          <PageAction
            label={t.t(`Transactions.add`)}
            Icon={IconPlus}
            href={TRANSACTION_PATHS.new}
            navigate={navigate}
            dataE2E="transaction-new"
          />
        )}
      />
      <Stack>
        {props.intro}
        {!canWrite && (
          <p class="text-sm text-muted" data-e2e="transactions-read-only">
            {t.t(`Transactions.readOnly`)}
          </p>
        )}
        {props.listPlan
          ? <PlanRefusalNotice groupId={group.id} refusal={props.listPlan} navigate={navigate} />
          : <ErrorState message={messageText(t, props.listError)} />}
        {trash ? <Trash {...props} rows={props.deleted!} /> : <Live {...props} />}
      </Stack>
    </Page>
  )
}

/** The live list: the filter bar, then one card per day, or the empty state that fits. */
function Live(props: TransactionsScreenProps): JSX.Element {
  const t = useAppText()
  const { filters } = props
  const canWrite = props.group!.canWrite
  const shown = filterTransactions(props.rows, filters)
  const filtered = hasFilters(filters) || filters.q.trim() !== ""
  return (
    <>
      {(props.rows.length > 0 || filtered) && (
        <TransactionsFilterBar {...props} count={shown.length} />
      )}
      {shown.length > 0
        ? <Days {...props} rows={shown} />
        : <Empty {...props} canWrite={canWrite} filtered={filtered} />}
      {canWrite && (
        <div>
          <Link
            href={TRANSACTION_PATHS.deleted}
            navigate={props.navigate}
            class="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline sm:min-h-9"
            data-e2e="transactions-show-deleted"
          >
            {t.t(`Transactions.showDeleted`)}
          </Link>
        </div>
      )}
    </>
  )
}

/** What the list shows with no row to show, most specific first. */
function Empty(
  props: TransactionsScreenProps & { canWrite: boolean; filtered: boolean },
): JSX.Element {
  const t = useAppText()
  const { canWrite, navigate } = props
  if (props.rows.length === 0 && props.loading) {
    return <ListEmpty title={t.t(`Transactions.loading`)} />
  }
  if (!props.loaded && props.offline) {
    return (
      <div data-e2e="transactions-no-copy">
        <ListEmpty
          title={t.t(`Transactions.noCopy`)}
          description={t.t(`Transactions.noCopyHint`)}
        />
      </div>
    )
  }
  if (props.rows.length > 0 && props.filters.q.trim() !== "" && !hasFilters(props.filters)) {
    return (
      <div data-e2e="transactions-search-empty">
        <ListEmpty
          title={t.t(`Transactions.searchEmpty`, { query: props.filters.q.trim() })}
          description={t.t(`Transactions.searchEmptyHint`)}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onFiltersChange?.({ q: "" })}
              data-e2e="transactions-clear-search"
            >
              {t.t(`Transactions.clearSearch`)}
            </Button>
          }
        />
      </div>
    )
  }
  if (props.rows.length > 0 && props.filtered) {
    return (
      <div data-e2e="transactions-filtered-empty">
        <ListEmpty
          title={t.t(`Transactions.filteredEmpty`)}
          description={t.t(`Transactions.filteredEmptyHint`)}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={props.onClearFilters}
              data-e2e="transactions-clear-filters"
            >
              {t.t(`Transactions.clearFilters`)}
            </Button>
          }
        />
      </div>
    )
  }
  if (!canWrite) {
    return (
      <div data-e2e="transactions-empty">
        <ListEmpty title={t.t(`Transactions.emptyViewer`)} />
      </div>
    )
  }
  if (props.accounts.every((account) => account.archived)) {
    return (
      <div data-e2e="transactions-no-account">
        <ListEmpty
          title={t.t(`Transactions.noAccount`)}
          description={t.t(`Transactions.noAccountHint`)}
          action={
            <Button
              href={ACCOUNT_PATHS.new}
              navigate={navigate}
              variant="secondary"
              data-e2e="transactions-add-account"
            >
              {t.t(`Transactions.addAccount`)}
            </Button>
          }
        />
      </div>
    )
  }
  return (
    <div data-e2e="transactions-empty">
      <ListEmpty
        title={t.t(`Transactions.empty`)}
        description={t.t(`Transactions.emptyHint`, { key: props.newKey })}
        action={
          <Button
            href={TRANSACTION_PATHS.new}
            navigate={navigate}
            variant="secondary"
            data-e2e="transaction-new-empty"
          >
            {t.t(`Transactions.add`)}
          </Button>
        }
      />
    </div>
  )
}

/** The search, the account, category and kind menus, the date range and how many entries show. */
function TransactionsFilterBar(
  props: TransactionsScreenProps & { count: number },
): JSX.Element {
  const t = useAppText()
  const { filters } = props
  const change = (next: Partial<TransactionFilters>) => props.onFiltersChange?.(next)
  const menus: FilterBarMenu[] = []
  if (props.accounts.length > 1) {
    menus.push({
      id: "account",
      label: t.t(`Transactions.account`),
      anyLabel: t.t(`Transactions.allAccounts`),
      options: props.accounts.map((account) => ({ value: account.id, label: account.name })),
      value: filters.accountId,
      onChange: (accountId) => change({ accountId }),
    })
  }
  if (props.categories.length > 0) {
    menus.push({
      id: "category",
      label: t.t(`Transactions.category`),
      anyLabel: t.t(`Transactions.allCategories`),
      options: props.categories.map((category) => ({ value: category.id, label: category.name })),
      value: filters.categoryId,
      onChange: (categoryId) => change({ categoryId }),
    })
  }
  menus.push({
    id: "kind",
    label: t.t(`Transactions.kind`),
    anyLabel: t.t(`Transactions.anyKind`),
    options: [
      { value: String(TransactionKind.EXPENSE), label: t.t(`Transactions.expenses`) },
      { value: String(TransactionKind.INCOME), label: t.t(`Transactions.income`) },
    ],
    value: filters.kind === null ? null : String(filters.kind),
    onChange: (kind) => change({ kind: kind === null ? null : Number(kind) as TransactionKind }),
  })
  return (
    <div class="flex flex-col gap-3" data-e2e="transactions-filter-bar">
      <FilterBar
        search={{
          value: filters.q,
          onChange: (q) => change({ q }),
          label: t.t(`Transactions.search`),
          placeholder: t.t(`Transactions.search`),
        }}
        filters={menus}
        onClear={props.onClearFilters}
        clearLabel={t.t(`Transactions.clearFilters`)}
        count={
          <span data-e2e="transactions-count">
            {t.t(`Transactions.count`, { count: props.count })}
          </span>
        }
      />
      {
        /* The date range: two native date fields, side by side from the smallest phone up, each
          shrinking instead of pushing the page sideways. */
      }
      <div class="grid grid-cols-2 gap-3 sm:max-w-md">
        <Field id="transactions-from" label={t.t(`Transactions.from`)}>
          <Input
            type="date"
            name="from"
            class="min-w-0"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => change({ from: e.currentTarget.value })}
            data-e2e="transactions-from"
          />
        </Field>
        <Field id="transactions-to" label={t.t(`Transactions.to`)}>
          <Input
            type="date"
            name="to"
            class="min-w-0"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => change({ to: e.currentTarget.value })}
            data-e2e="transactions-to"
          />
        </Field>
      </div>
    </div>
  )
}

/** The entries under a heading per day: "Today", "Yesterday", then the date. */
function Days(props: TransactionsScreenProps & { rows: TransactionRow[] }): JSX.Element {
  const { locale } = useFormat()
  return (
    <>
      {byDay(props.rows).map((day) => {
        const heading = `transactions-day-${day.date}`
        return (
          <section key={day.date} aria-labelledby={heading} class="flex flex-col gap-2">
            <h2 id={heading} class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {relativeDayLabel(day.date, props.today, locale)}
            </h2>
            <ListCard dataE2E="transaction-list">
              {day.rows.map((row) => (
                <Row key={row.id} row={row} today={props.today} navigate={props.navigate} />
              ))}
            </ListCard>
          </section>
        )
      })}
    </>
  )
}

/** "Expense of €4.50 in Coffee, Today": what a screen reader says for a row. */
export function rowName(
  t: Translator<string>,
  row: TransactionRow,
  locale: string,
  today: string,
): string {
  return t.t(`Transactions.rowName`, {
    kind: row.kind === TransactionKind.INCOME
      ? t.t(`TransactionEditor.income`)
      : t.t(`TransactionEditor.expense`),
    amount: money(Math.abs(row.amount), row.currency, locale),
    category: row.categoryName,
    date: relativeDayLabel(row.date, today, locale),
  })
}

function money(amount: number, currency: string, locale: string): string {
  return formatMoney(amount, currency, locale, { decimals: amountDecimals(currency) })
}

/**
 * One entry, a link to its page: the category and the amount, then the memo, the account and who
 * added it. An entry in another currency than its account's shows the account's amount too.
 */
function Row(
  { row, today, navigate }: { row: TransactionRow; today: string; navigate?: Navigate },
): JSX.Element {
  const t = useAppText()
  const { locale } = useFormat()
  const meta = [row.memo, row.accountName, row.author].filter((part) => part)
  return (
    <li data-e2e={`transaction-${row.id}`}>
      <Link
        href={TRANSACTION_PATHS.transaction(row.id)}
        navigate={navigate}
        aria-label={rowName(t, row, locale, today)}
        class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus sm:px-6"
        data-e2e="transaction-row"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="line-clamp-2 break-words font-medium" data-e2e="transaction-category">
            <bdi>{row.categoryName}</bdi>
          </span>
          {meta.length > 0 && (
            <span class="line-clamp-2 break-words text-sm text-muted" data-e2e="transaction-meta">
              {meta.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && " · "}
                  <bdi>{part}</bdi>
                </Fragment>
              ))}
            </span>
          )}
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1 text-end">
          <EntryAmount
            amount={row.amount}
            currency={row.currency}
            class="font-medium"
          />
          {row.currency !== row.accountCurrency && (
            <span class="text-sm text-muted" data-e2e="transaction-account-amount">
              {row.queued && row.converted
                ? t.t(`Transactions.convertLater`)
                : t.t(row.converted ? `Transactions.convertedIn` : `Transactions.amountIn`, {
                  amount: money(row.accountAmount, row.accountCurrency, locale),
                  account: row.accountName,
                })}
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}

/** The deleted entries with Restore, and when they go for good. */
function Trash(props: TransactionsScreenProps & { rows: readonly TransactionRow[] }): JSX.Element {
  const t = useAppText()
  const { locale } = useFormat()
  const canWrite = props.group!.canWrite
  return (
    <>
      <p class="text-sm text-muted" data-e2e="transactions-deleted-hint">
        {t.t(`Transactions.deletedHint`, { days: TRANSACTION_RESTORE_DAYS })}
      </p>
      {props.rows.length === 0
        ? (
          <ListEmpty
            title={props.loading ? t.t(`Transactions.loading`) : t.t(`Transactions.deletedEmpty`)}
          />
        )
        : (
          <ListCard dataE2E="transaction-trash">
            {props.rows.map((row) => {
              const label = t.t(`Transactions.amountInCategory`, {
                amount: money(Math.abs(row.amount), row.currency, locale),
                category: row.categoryName,
              })
              return (
                <li
                  key={row.id}
                  class="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-6"
                  data-e2e={`transaction-${row.id}`}
                >
                  <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="line-clamp-2 break-words font-medium">
                      <bdi>{row.categoryName}</bdi>
                    </span>
                    {row.deletedAt && (
                      <span class="text-sm text-muted">
                        <Rich
                          parts={t.parts(`Transactions.deletedOn`, { date: `` })}
                          tags={{ date: () => <When at={row.deletedAt!} /> }}
                        />
                      </span>
                    )}
                  </div>
                  <EntryAmount amount={row.amount} currency={row.currency} class="shrink-0" />
                  {canWrite && props.onRestore && (
                    <Button
                      type="button"
                      variant="outline"
                      class="min-h-11 shrink-0 sm:min-h-9"
                      onClick={() => props.onRestore!(row.id)}
                      busy={props.pendingId === row.id}
                      busyLabel={t.t(`Transactions.restoring`)}
                      aria-label={t.t(`Transactions.restoreNamed`, { name: label })}
                      data-e2e="transaction-restore"
                    >
                      {t.t(`Transactions.restore`)}
                    </Button>
                  )}
                </li>
              )
            })}
          </ListCard>
        )}
    </>
  )
}

/** The page's content, in the column the app's frame sets: never a width of its own. */
function Page({ children }: { children?: ComponentChildren }): JSX.Element {
  return <div class="flex flex-col gap-8">{children}</div>
}
