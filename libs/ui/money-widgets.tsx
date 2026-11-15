import type { JSX } from "preact"
import { isolate } from "@spy4x/preact-ui/bdi"
import { WidgetStat } from "@spy4x/preact-ui/widget-card"
import { formatMoneyParts } from "@spy4x/platform/universal/money"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { type LedgerFigures, MONEY_WIDGET_IDS, type MoneyWidgetResult } from "@domain/transactions"
import { previousPeriodName, type WidgetDrawContext, type WidgetView } from "./note-widgets.tsx"
import { TRANSACTION_PATHS } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"

/**
 * The household overview's money widgets: Net, Income and Spending for the range. Every figure is
 * the ledger read's (`MoneyWidgetResult`), never a sum made here. Words come before the number, no
 * colour or arrow says good or bad, a converted figure says "about" and names its newest rate
 * date, and a currency with no rate is named under the figure it affects, never counted as zero.
 */

/** Which of the ledger's figures a card draws. */
type Side = "net" | "income" | "spending"

/** What one card reads from a ledger: its figure, its left-out currencies and its rate date. */
interface SideFigures {
  amount: number | null
  leftOut: readonly string[]
  rateDate: string | null
}

/** The figure of `side` in `ledger`, with what it left out and the newest rate it used. */
function sideOf(side: Side, ledger: LedgerFigures): SideFigures {
  if (side === "income") {
    return { amount: ledger.income, leftOut: ledger.incomeLeftOut, rateDate: ledger.incomeRateDate }
  }
  if (side === "spending") {
    return {
      amount: ledger.spending,
      leftOut: ledger.spendingLeftOut,
      rateDate: ledger.spendingRateDate,
    }
  }
  return { amount: ledger.net, leftOut: ledger.leftOut, rateDate: ledger.rateDate }
}

/** The kind filter of the transactions list each card links to: `?kind=2` income, `1` expense. */
const LINK_KIND: Record<Side, string | null> = { net: null, income: "2", spending: "1" }

/** The transactions list for `side` over the range's days. */
export function moneyLinkHref(side: Side, range: { from: string; to: string }): string {
  const query = new URLSearchParams()
  const kind = LINK_KIND[side]
  if (kind) query.set(`kind`, kind)
  query.set(`from`, range.from)
  query.set(`to`, range.to)
  return `${TRANSACTION_PATHS.list}?${query}`
}

/**
 * `amount` in the region format, kept in its own direction, with a typographic minus: "−₫800,000".
 * `signed` prints a plus on a positive amount, as a change does.
 */
export function moneyText(amount: number, currency: string, locale: string, signed = false) {
  const text = formatMoneyParts(amount, currency, locale, {
    signDisplay: signed ? `exceptZero` : `auto`,
  }).map((part) => part.type === `minusSign` ? `−` : part.value).join(``)
  return isolate(text)
}

/**
 * "You kept … of … (11%)." and its variants: the Net card's sentence, or `null` with none. A
 * currency left out of either side gets no sentence: "no income" or "100%" would be untrue, and the
 * card's left-out line already says what is missing.
 */
export function netSentence(
  t: Translator<string>,
  ledger: LedgerFigures,
  locale: string,
): string | null {
  const { income, spending, net } = ledger
  if (income === null || spending === null || net === null) return null
  if (ledger.leftOut.length > 0) return null
  const about = ledger.rateDate !== null
  const money = (amount: number) => moneyText(amount, ledger.currency, locale)
  if (income === 0) {
    if (spending <= 0) return null
    const key = about ? `MoneyWidgets.netNoIncomeAbout` : `MoneyWidgets.netNoIncome`
    return t.t(key, { spent: money(spending) })
  }
  if (net === 0) {
    return t.t(about ? `MoneyWidgets.netEvenAbout` : `MoneyWidgets.netEven`, {
      income: money(income),
    })
  }
  if (net < 0) {
    return t.t(about ? `MoneyWidgets.netOverAbout` : `MoneyWidgets.netOver`, { over: money(-net) })
  }
  // Rounded down, in integers: 99.9% is never "100%", and a sliver of a big income is "less than 1%".
  const percent = Number((BigInt(net) * 100n) / BigInt(income))
  if (percent < 1) {
    return t.t(about ? `MoneyWidgets.netKeptTinyAbout` : `MoneyWidgets.netKeptTiny`, {
      kept: money(net),
      income: money(income),
    })
  }
  return t.t(about ? `MoneyWidgets.netKeptAbout` : `MoneyWidgets.netKept`, {
    kept: money(net),
    income: money(income),
    percent: new Intl.NumberFormat(locale, { style: `percent` }).format(percent / 100),
  })
}

/** Keys of the `app` catalog, by side. */
const KEYS = {
  net: {
    loading: `MoneyWidgets.netLoading`,
    error: `MoneyWidgets.netError`,
    leftOut: `MoneyWidgets.netLeftOut`,
    tooLarge: `MoneyWidgets.netTooLarge`,
    none: `MoneyWidgets.netNone`,
    link: `MoneyWidgets.netLink`,
  },
  income: {
    loading: `MoneyWidgets.incomeLoading`,
    error: `MoneyWidgets.incomeError`,
    leftOut: `MoneyWidgets.incomeLeftOut`,
    tooLarge: `MoneyWidgets.incomeTooLarge`,
    none: `MoneyWidgets.incomeNone`,
    link: `MoneyWidgets.incomeLink`,
  },
  spending: {
    loading: `MoneyWidgets.spendingLoading`,
    error: `MoneyWidgets.spendingError`,
    leftOut: `MoneyWidgets.spendingLeftOut`,
    tooLarge: `MoneyWidgets.spendingTooLarge`,
    none: `MoneyWidgets.spendingNone`,
    link: `MoneyWidgets.spendingLink`,
  },
} as const

/** Whether the range had nothing to count on this card's side, counted or left out. */
function isEmpty(side: Side, ledger: LedgerFigures, figures: SideFigures): boolean {
  if (figures.leftOut.length > 0) return false
  return side === "net" ? ledger.income === 0 && ledger.spending === 0 : figures.amount === 0
}

/** Whether every entry on this card's side lacked a rate, so its figure would be made of nothing. */
function isAllLeftOut(side: Side, ledger: LedgerFigures, figures: SideFigures): boolean {
  if (figures.leftOut.length === 0) return false
  return side === "net" ? ledger.income === 0 && ledger.spending === 0 : figures.amount === 0
}

/** One money card's body: the sentence, the figure and its muted lines, then the link. */
export function MoneyBody(
  { side, result, context }: {
    side: Side
    result: MoneyWidgetResult
    context: WidgetDrawContext
  },
): JSX.Element {
  const t = useAppText()
  const { format, periods } = context
  const { locale } = format
  const ledger = result.current
  const figures = sideOf(side, ledger)
  const keys = KEYS[side]
  const tooLarge = ledger.tooLarge || figures.amount === null
  const allLeftOut = !tooLarge && isAllLeftOut(side, ledger, figures)
  const shown = tooLarge || allLeftOut ? null : figures.amount
  const lines: JSX.Element[] = []
  if (shown !== null) {
    const before = result.previous ? sideOf(side, result.previous).amount : null
    if (before !== null && !result.previous?.tooLarge) {
      const period = previousPeriodName(t, periods.days)
      lines.push(
        <span data-e2e="money-widget-change">
          {shown === before
            ? t.t(`MoneyWidgets.noChange`, { period })
            : t.t(`MoneyWidgets.change`, {
              change: moneyText(shown - before, ledger.currency, locale, true),
              period,
            })}
        </span>,
      )
    }
    if (figures.rateDate !== null) {
      lines.push(
        <span data-e2e="money-widget-rates">
          {t.t(`MoneyWidgets.rates`, { date: rateDay(context, figures.rateDate) })}
        </span>,
      )
    }
    if (isEmpty(side, ledger, figures)) {
      lines.push(<span data-e2e="money-widget-none">{t.t(keys.none)}</span>)
    }
  }
  if (tooLarge) {
    lines.push(<span data-e2e="money-widget-too-large">{t.t(keys.tooLarge)}</span>)
  }
  if (figures.leftOut.length > 0) {
    lines.push(
      <span data-e2e="money-widget-left-out">
        {t.t(keys.leftOut, {
          count: figures.leftOut.length,
          currencies: new Intl.ListFormat(t.language, { type: `conjunction` })
            .format(figures.leftOut.map(isolate)),
        })}
      </span>,
    )
  }
  const value = shown === null ? null : moneyText(shown, ledger.currency, locale)
  const sentence = side === "net" && shown !== null ? netSentence(t, ledger, locale) : null
  return (
    <div class="flex flex-col gap-2">
      {sentence && (
        <p class="text-sm text-foreground" data-e2e="money-widget-sentence">{sentence}</p>
      )}
      {value === null
        ? lines.map((line, index) => <p key={index} class="text-sm text-muted">{line}</p>)
        : (
          <WidgetStat
            value={value}
            valueLabel={figures.rateDate === null
              ? undefined
              : t.t(`MoneyWidgets.about`, { amount: value })}
            lines={lines}
          />
        )}
      <a
        href={moneyLinkHref(side, periods.current)}
        class="pc-link inline-flex min-h-11 items-center self-start text-sm sm:min-h-9"
        data-e2e="money-widget-link"
      >
        {t.t(keys.link)}
      </a>
    </div>
  )
}

/** A rate's calendar day as the overview writes days: with its year only when the range's differs. */
function rateDay({ format, days, periods }: WidgetDrawContext, iso: string): string {
  const at = `${iso}T00:00:00Z`
  const utc = days ?? format.utc()
  return iso.slice(0, 4) === periods.current.to.slice(0, 4) ? utc.dayMonth(at) : utc.date(at)
}

function view(side: Side): WidgetView {
  return {
    loadingKey: KEYS[side].loading,
    errorKey: KEYS[side].error,
    draw: (data, context) => ({
      status: "ready",
      content: <MoneyBody side={side} result={data as MoneyWidgetResult} context={context} />,
    }),
  }
}

/** How the overview draws each money widget, by widget id. */
export const MONEY_WIDGET_VIEWS: Readonly<Record<string, WidgetView>> = {
  [MONEY_WIDGET_IDS.net]: view("net"),
  [MONEY_WIDGET_IDS.income]: view("income"),
  [MONEY_WIDGET_IDS.spending]: view("spending"),
}
