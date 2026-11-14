import { Fragment, type JSX } from "preact"
import { useFormat } from "@spy4x/preact-ui/format"
import { Link } from "@spy4x/preact-ui/link"
import { MoneyDisplay } from "@spy4x/preact-ui/money-display"
import { IconArrowRight } from "@spy4x/preact-icons"
import { relativeDayLabel } from "@spy4x/time/locale"
import { formatMoney } from "@spy4x/platform/universal/money-core"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { amountDecimals } from "@domain/money"
import type { TransferRow } from "./transaction-parts.tsx"
import { type Navigate, TRANSFER_PATHS } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"

/** An amount in its currency's smallest unit as text, in the person's region format. */
export function moneyText(amount: number, currency: string, locale: string): string {
  return formatMoney(amount, currency, locale, { decimals: amountDecimals(currency) })
}

/**
 * "32,500": how much of `toCurrency` one unit of `fromCurrency` bought, from the two amounts.
 * The rate is never stored, so it is worked out for the screen only.
 */
export function impliedRate(
  sent: number,
  fromCurrency: string,
  received: number,
  toCurrency: string,
  locale: string,
): string {
  const rate = (received / 10 ** amountDecimals(toCurrency)) /
    (sent / 10 ** amountDecimals(fromCurrency))
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(rate)
}

/**
 * "Transfer of €200.00 from Card to Cash, Today": what a screen reader says for a transfer's row.
 * Across currencies it names what arrived too.
 */
export function transferRowName(
  t: Translator<string>,
  row: TransferRow,
  locale: string,
  today: string,
): string {
  const values = {
    sent: moneyText(row.sentAmount, row.fromCurrency, locale),
    from: row.fromAccountName,
    to: row.toAccountName,
    date: relativeDayLabel(row.date, today, locale),
  }
  return row.fromCurrency === row.toCurrency
    ? t.t(`TransferRow.name`, values)
    : t.t(`TransferRow.nameAcross`, {
      ...values,
      received: moneyText(row.receivedAmount, row.toCurrency, locale),
    })
}

/**
 * A transfer in the transactions list, a link to its page: "Card → Cash", then the memo and who
 * added it. Its amount is neither income nor spending, so it is never green. With the list
 * filtered by one account, the amount is that account's side: money leaving it has a minus sign,
 * money arriving has none. Across currencies a muted line names the other side, with "≈" when the
 * server converted it.
 */
export function TransferListRow(
  { row, today, accountId, navigate }: {
    row: TransferRow
    today: string
    /** The account the list is filtered by, or `null`. */
    accountId: string | null
    navigate?: Navigate
  },
): JSX.Element {
  const t = useAppText()
  const { locale } = useFormat()
  const meta = [row.memo, row.author].filter((part) => part)
  const into = accountId !== null && accountId === row.toAccountId &&
    accountId !== row.fromAccountId
  const across = row.fromCurrency !== row.toCurrency
  const approx = row.converted ? `≈ ` : ``
  return (
    <li data-e2e={`transfer-${row.id}`}>
      <Link
        href={TRANSFER_PATHS.transfer(row.id)}
        navigate={navigate}
        aria-label={transferRowName(t, row, locale, today)}
        class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus sm:px-6"
        data-e2e="transfer-row"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span
            class="flex min-w-0 flex-wrap items-center gap-x-2 break-words font-medium"
            data-e2e="transfer-accounts"
          >
            <bdi>{row.fromAccountName}</bdi>
            <IconArrowRight class="size-4 shrink-0 text-muted rtl:rotate-180" />
            <bdi>{row.toAccountName}</bdi>
          </span>
          {meta.length > 0 && (
            <span class="line-clamp-2 break-words text-sm text-muted" data-e2e="transfer-meta">
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
          <span data-e2e="transfer-amount">
            {into && approx}
            <MoneyDisplay
              amount={into
                ? row.receivedAmount
                : accountId === row.fromAccountId
                ? -row.sentAmount
                : row.sentAmount}
              currency={into ? row.toCurrency : row.fromCurrency}
              decimals={amountDecimals(into ? row.toCurrency : row.fromCurrency)}
              tone="plain"
              class="font-medium"
            />
          </span>
          {across && (
            <span class="text-sm text-muted" data-e2e="transfer-other-amount">
              {into
                ? t.t(`TransferRow.sent`, {
                  amount: moneyText(row.sentAmount, row.fromCurrency, locale),
                })
                : approx + t.t(`TransferRow.received`, {
                  amount: moneyText(row.receivedAmount, row.toCurrency, locale),
                })}
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}
