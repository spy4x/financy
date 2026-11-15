import type { JSX } from "preact"
import { isolate } from "@spy4x/preact-ui/bdi"
import { Link } from "@spy4x/preact-ui/link"
import { DEFAULT_CHART_PALETTE } from "@spy4x/preact-charts/colors"
import { type RankedBarRow, RankedBars } from "@spy4x/preact-charts/ranked-bars"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { type CategoryWidgetResult, MONEY_WIDGET_IDS } from "@domain/transactions"
import { moneyLinkHref, moneyText, rateDay } from "./money-widgets.tsx"
import type { WidgetDrawContext, WidgetView } from "./note-widgets.tsx"
import { LINKED_GROUP_PARAM, TRANSACTION_PATHS } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"

/**
 * "Where did the money go?" on the household overview: a sentence naming the category that spent
 * most, then a ranked row per top-level category with its amount and its share of spending. The
 * figures are the ledger read's (`CategoryWidgetResult`), never a sum made here. Every bar has one
 * colour, so none reads as good or bad; a converted figure says "about" and names its newest rate
 * date, and a currency with no rate is named, never counted as zero.
 */

/**
 * The transactions list of household `groupId` (else the selected one) in category `categoryId`
 * over the range. No kind: the category filter takes its children in, and a refund must show.
 */
export function categoryLinkHref(
  categoryId: string,
  range: { from: string; to: string },
  groupId?: string,
): string {
  const query = new URLSearchParams()
  if (groupId) query.set(LINKED_GROUP_PARAM, groupId)
  query.set(`category`, categoryId)
  query.set(`from`, range.from)
  query.set(`to`, range.to)
  return `${TRANSACTION_PATHS.list}?${query}`
}

/**
 * A category's share of `total` in whole percent, rounded down so 99.9% is never "100%", or `null`
 * when `total` is not above zero and a share would mean nothing.
 */
export function shareOf(spending: number, total: number | null): number | null {
  if (total === null || total <= 0) return null
  return Number((BigInt(spending) * 100n) / BigInt(total))
}

/** A share as the card writes it: "34%", or "less than 1%" for a sliver. */
export function shareText(t: Translator<string>, percent: number, locale: string): string {
  return percent < 1
    ? t.t(`MoneyWidgets.categoriesShareTiny`)
    : new Intl.NumberFormat(locale, { style: `percent` }).format(percent / 100)
}

/**
 * "Most went to Rent: 34% of your spending." and its "about" variant, or `null` with none: no
 * category spent, a currency is left out (a share of part of the spending would be untrue), or
 * spending is not above zero.
 */
export function categorySentence(
  t: Translator<string>,
  result: CategoryWidgetResult,
  locale: string,
): string | null {
  const [first] = result.top
  if (!first || result.spendingLeftOut.length > 0) return null
  const percent = shareOf(first.spending, result.spending)
  if (percent === null) return null
  const key = result.spendingRateDate === null
    ? `MoneyWidgets.categoriesTop`
    : `MoneyWidgets.categoriesTopAbout`
  return t.t(key, { category: isolate(first.name), share: shareText(t, percent, locale) })
}

const LINK_CLASS = `pc-link inline-flex min-h-11 items-center self-start text-sm sm:min-h-9`

/**
 * `RankedBars` cuts a label after two lines; a category name is the person's own words, so it
 * wraps in full instead.
 */
const WHOLE_NAMES = `[&_.line-clamp-2]:line-clamp-none`

/** The card's body: the sentence, the ranked rows, "and N more", then the muted lines. */
export function CategoryBody(
  { result, context }: { result: CategoryWidgetResult; context: WidgetDrawContext },
): JSX.Element {
  const t = useAppText()
  const { locale } = context.format
  const range = context.periods.current
  const about = result.spendingRateDate !== null
  const tooLarge = result.tooLarge || result.spending === null
  const lines: JSX.Element[] = []
  if (!tooLarge && result.top.length > 0 && about) {
    lines.push(
      <p class="text-sm text-muted" data-e2e="category-widget-rates">
        {t.t(`MoneyWidgets.rates`, { date: rateDay(context, result.spendingRateDate!) })}
      </p>,
    )
  }
  if (tooLarge) {
    lines.push(
      <p class="text-sm text-muted" data-e2e="category-widget-too-large">
        {t.t(`MoneyWidgets.spendingTooLarge`)}
      </p>,
    )
  } else if (result.top.length === 0 && result.spendingLeftOut.length === 0) {
    lines.push(
      <p class="text-sm text-muted" data-e2e="category-widget-none">
        {t.t(`MoneyWidgets.spendingNone`)}
      </p>,
    )
  }
  if (result.spendingLeftOut.length > 0) {
    lines.push(
      <p class="text-sm text-muted" data-e2e="category-widget-left-out">
        {t.t(`MoneyWidgets.spendingLeftOut`, {
          count: result.spendingLeftOut.length,
          currencies: new Intl.ListFormat(t.language, { type: `conjunction` })
            .format(result.spendingLeftOut.map(isolate)),
        })}
      </p>,
    )
  }
  const shown = tooLarge ? [] : result.top
  const sentence = tooLarge ? null : categorySentence(t, result, locale)
  const amount = (value: number) => {
    const text = moneyText(value, result.currency, locale)
    return about ? t.t(`MoneyWidgets.about`, { amount: text }) : text
  }
  return (
    <div class="flex min-w-0 flex-col gap-2">
      {sentence && (
        <p class="text-sm text-foreground" data-e2e="category-widget-sentence">{sentence}</p>
      )}
      {shown.length > 0 && (
        <div data-e2e="category-widget-rows">
          <RankedBars
            ariaLabel={t.t(`MoneyWidgets.categoriesTitle`)}
            columns={{
              label: t.t(`MoneyWidgets.categoriesColumnCategory`),
              value: t.t(`MoneyWidgets.categoriesColumnSpent`),
              extra: [{
                label: t.t(`MoneyWidgets.categoriesColumnShare`),
                format: (percent) => shareText(t, percent, locale),
              }],
            }}
            format={amount}
            colors={[DEFAULT_CHART_PALETTE[0]]}
            navigate={context.navigate}
            class={WHOLE_NAMES}
            data={shown.map((row): RankedBarRow => ({
              label: row.name,
              value: row.spending,
              values: [shareOf(row.spending, result.spending)],
              href: categoryLinkHref(row.categoryId, range, context.groupId),
            }))}
          />
        </div>
      )}
      {!tooLarge && result.more > 0 && (
        <Link
          href={moneyLinkHref(`spending`, range, context.groupId)}
          navigate={context.navigate}
          class={LINK_CLASS}
          data-e2e="category-widget-more"
        >
          {t.t(`MoneyWidgets.categoriesMore`, { count: result.more })}
        </Link>
      )}
      {lines}
    </div>
  )
}

/** How the overview draws "Where did the money go?", by widget id. */
export const CATEGORY_WIDGET_VIEWS: Readonly<Record<string, WidgetView>> = {
  [MONEY_WIDGET_IDS.categories]: {
    loadingKey: `MoneyWidgets.categoriesLoading`,
    errorKey: `MoneyWidgets.categoriesError`,
    draw: (data, context) => ({
      status: "ready",
      content: <CategoryBody result={data as CategoryWidgetResult} context={context} />,
    }),
  },
}
