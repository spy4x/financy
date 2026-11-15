import type { JSX } from "preact"
import { isolate } from "@spy4x/preact-ui/bdi"
import { Link } from "@spy4x/preact-ui/link"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { periodLabel, periodOf, PeriodUnit } from "@spy4x/time/period"
import { BUDGET_WIDGET_IDS, budgetStanding, type BudgetWidgetResult } from "@domain/budgets"
import { CategoryKind } from "@domain/categories"
import { BudgetBars } from "./budgets-screen.tsx"
import type { CategoryRow } from "./category-parts.tsx"
import { moneyText } from "./money-widgets.tsx"
import type { WidgetDrawContext, WidgetView } from "./note-widgets.tsx"
import { BUDGET_PATHS, LINKED_GROUP_PARAM, LINKED_MONTH_PARAM } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"

/**
 * The household overview's budgets widget: one calendar month's sentence and bars. The numbers are
 * `budget.month`'s for that month (`BudgetWidgetResult`), never a sum made here; the sentence comes
 * from {@link budgetStanding}, and the bars are the Budgets screen's own, read-only. No colour says
 * good or bad beyond what those bars already show, and a currency with no rate is named, never
 * counted as zero.
 */

/** The Budgets screen of household `groupId` (else the selected one) at `month`, `YYYY-MM`. */
export function budgetsLinkHref(month: string, groupId?: string): string {
  const query = new URLSearchParams()
  if (groupId) query.set(LINKED_GROUP_PARAM, groupId)
  query.set(LINKED_MONTH_PARAM, month)
  return `${BUDGET_PATHS.list}?${query}`
}

/**
 * "4 of 6 budgets on track; Food is $80.00 over." and its variants, or `null` with none: no budget
 * this month, a currency left out, or a figure too large, since any sentence would then be untrue.
 */
export function budgetSentence(
  t: Translator<string>,
  result: BudgetWidgetResult,
  locale: string,
): string | null {
  const standing = budgetStanding(result.budgets)
  if (standing.total === 0 || standing.leftOut.length > 0 || standing.tooLarge) return null
  const count = standing.total
  const [most] = standing.over
  if (!most) return t.t(`BudgetWidgets.allOnTrack`, { count })
  const name = result.categories.find((category) => category.id === most.categoryId)?.name ?? ``
  const values = {
    count,
    onTrack: standing.onTrack,
    category: isolate(name),
    amount: moneyText(most.amount, most.currency, locale),
  }
  return standing.over.length === 1
    ? t.t(`BudgetWidgets.oneOver`, values)
    : t.t(`BudgetWidgets.moreOver`, { ...values, more: standing.over.length - 1 })
}

const LINK_CLASS = `pc-link inline-flex min-h-11 items-center self-start text-sm sm:min-h-9`

/** The card's body: the month, the sentence, the bars and the link to the Budgets screen. */
export function BudgetBody(
  { result, context }: { result: BudgetWidgetResult; context: WidgetDrawContext },
): JSX.Element {
  const t = useAppText()
  const { budgets } = result
  const month = periodLabel(periodOf(PeriodUnit.Month, `${budgets.month}-01`), t.language)
  const standing = budgetStanding(budgets)
  const href = budgetsLinkHref(budgets.month, context.groupId)
  if (standing.total === 0) {
    return (
      <div class="flex flex-col gap-2">
        <p class="text-sm text-foreground" data-e2e="budget-widget-none">
          {t.t(`BudgetWidgets.none`, { month })}
        </p>
        <Link
          href={href}
          navigate={context.navigate}
          class={LINK_CLASS}
          data-e2e="budget-widget-link"
        >
          {t.t(`BudgetWidgets.setLink`)}
        </Link>
      </div>
    )
  }
  const sentence = budgetSentence(t, result, context.format.locale)
  // The bars the Budgets screen draws with a limit; a row with none only says what was spent there.
  const drawn = budgets.rows.filter((row) => row.limit !== null)
  const named = new Map(
    result.categories.map((category): [string, CategoryRow] => [category.id, {
      ...category,
      kind: CategoryKind.EXPENSE,
      archived: false,
    }]),
  )
  return (
    <div class="flex min-w-0 flex-col gap-2">
      <p class="text-sm text-muted" data-e2e="budget-widget-month">{month}</p>
      {sentence && (
        <p class="text-sm text-foreground" data-e2e="budget-widget-sentence">{sentence}</p>
      )}
      {standing.leftOut.length > 0 && (
        <p class="text-sm text-muted" data-e2e="budget-widget-left-out">
          {t.t(`Budgets.leftOutMonth`, {
            month,
            currencies: new Intl.ListFormat(t.language, { type: `conjunction` })
              .format(standing.leftOut.map(isolate)),
          })}
        </p>
      )}
      {drawn.length > 0 && (
        <ul class="divide-y divide-subtle" data-e2e="budget-widget-bars">
          <BudgetBars rows={drawn} named={named} flush />
        </ul>
      )}
      <Link
        href={href}
        navigate={context.navigate}
        class={LINK_CLASS}
        data-e2e="budget-widget-link"
      >
        {t.t(`BudgetWidgets.link`, { month })}
      </Link>
    </div>
  )
}

/** How the overview draws the budgets widget, by widget id. */
export const BUDGET_WIDGET_VIEWS: Readonly<Record<string, WidgetView>> = {
  [BUDGET_WIDGET_IDS.month]: {
    loadingKey: `BudgetWidgets.loading`,
    errorKey: `BudgetWidgets.error`,
    draw: (data, context) => ({
      status: "ready",
      content: <BudgetBody result={data as BudgetWidgetResult} context={context} />,
    }),
  },
}
