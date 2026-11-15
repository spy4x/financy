/**
 * The overview's budgets widget as a member sees it: the card names its month, one sentence counts
 * the budgets on track and names the one most over, a currency with no rate is named instead of a
 * sentence, the Budgets screen's bars are drawn read-only, and the link opens that month's Budgets
 * screen of the overview's household. Rendered as server HTML and read in a browser DOM
 * (happy-dom).
 */
import { expect } from "@std/expect"
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { renderToString } from "preact-render-to-string"
import { I18nContext } from "@spy4x/preact-ui/i18n"
import { createFormatters } from "@spy4x/time/format"
import {
  BUDGET_WIDGET_IDS,
  BUDGET_WIDGETS,
  budgetBand,
  BudgetLimitSource,
  BudgetMethod,
  type BudgetMonth,
  type BudgetRow,
  type BudgetWidgetResult,
} from "@domain/budgets"
import { overviewPeriods } from "@domain/groups"
import { MONEY_WIDGETS } from "@domain/transactions"
import { BUDGET_WIDGET_VIEWS, budgetsLinkHref } from "./budget-widgets.tsx"
import { OVERVIEW_VIEWS, OVERVIEW_WIDGETS } from "./overview-widgets.ts"
import type { WidgetDrawContext } from "./note-widgets.tsx"
import { ENGLISH } from "./i18n-testing.ts"

const window = new Window({ url: "http://app.localhost/" })
const own = { document: globalThis.document, location: globalThis.location }

beforeAll(() => {
  // A link reads the page's origin when it is clicked.
  Object.assign(globalThis, { document: window.document, location: window.location })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

const CONTEXT: WidgetDrawContext = {
  periods: overviewPeriods({ from: "2026-11-01", to: "2026-11-30" })!,
  endsToday: true,
  groupId: "g-a",
  format: createFormatters({ locale: "en-GB", timeZone: "UTC", hourCycle: null }),
}
const FOOD = "019a5b0e-1af5-7f04-8ae4-b1ee5d114001"
const GROCERIES = "019a5b0e-1af5-7f04-8ae4-b1ee5d114002"
const RENT = "019a5b0e-1af5-7f04-8ae4-b1ee5d114003"
const CAFES = "019a5b0e-1af5-7f04-8ae4-b1ee5d114004"
const NAMES: Record<string, string> = {
  [FOOD]: "Food",
  [GROCERIES]: "Groceries",
  [RENT]: "Rent",
  [CAFES]: "Cafes",
}

/** A row of `categoryId` with its own limit `limit` and `spending`, in USD, changed by `extra`. */
function limitRow(
  categoryId: string,
  spending: number | null,
  limit: number,
  extra: Partial<BudgetRow> = {},
): BudgetRow {
  const banded = spending === null ? null : budgetBand(spending, limit)
  return {
    categoryId,
    parentId: null,
    limit: { amount: limit, currency: "USD" },
    source: BudgetLimitSource.OWN,
    spending,
    currency: "USD",
    band: banded?.band ?? null,
    percent: banded?.percent ?? null,
    leftOut: [],
    ...extra,
  }
}

/** A row with no limit: the category's spending only. */
function bareRow(categoryId: string, spending = 0, parentId: string | null = null): BudgetRow {
  return {
    ...limitRow(categoryId, spending, 1),
    parentId,
    limit: null,
    source: null,
    band: null,
    percent: null,
  }
}

/** November 2026 with `rows`, and its categories named, changed by `extra`. */
function result(rows: BudgetRow[], extra: Partial<BudgetMonth> = {}): BudgetWidgetResult {
  const budgets: BudgetMonth = {
    month: "2026-11",
    from: "2026-11-01",
    to: "2026-11-30",
    baseCurrency: "USD",
    rows,
    method: BudgetMethod.LIMITS,
    methodVersion: null,
    ...extra,
  }
  return {
    budgets,
    categories: rows.map((row) => ({
      id: row.categoryId,
      name: NAMES[row.categoryId],
      icon: "tag",
      color: "#336699",
      parentId: row.parentId,
    })),
  }
}

/** The card body for `data`, drawn and read as a person reads it. */
function card(data: BudgetWidgetResult, context = CONTEXT) {
  const drawing = BUDGET_WIDGET_VIEWS[BUDGET_WIDGET_IDS.month].draw(data, context)
  expect(drawing.status).toBe("ready")
  const html = renderToString(
    <I18nContext.Provider value={ENGLISH}>{drawing.content}</I18nContext.Provider>,
  )
  const root = document.createElement("div")
  root.innerHTML = html
  // Names and amounts sit in their own direction (FSI … PDI): the sentence is the text around them.
  const read = (element: Element | null) =>
    element === null ? null : (element.textContent ?? "").replaceAll(/[⁨⁩]/g, "")
  return {
    root,
    line: (name: string) => read(root.querySelector(`[data-e2e=budget-widget-${name}]`)),
    link: root.querySelector<HTMLAnchorElement>("[data-e2e=budget-widget-link]")!,
    bars: [...root.querySelectorAll("[data-e2e=budget-widget-bars] > li")].map((item) =>
      item.getAttribute("data-e2e")
    ),
  }
}

describe("the overview's budgets widget", () => {
  it("comes right after the money widgets, across the overview, and never on the operator's page", () => {
    expect(OVERVIEW_WIDGETS.slice(0, MONEY_WIDGETS.length + 1).map((widget) => widget.id))
      .toEqual([...MONEY_WIDGETS.map((widget) => widget.id), BUDGET_WIDGET_IDS.month])
    expect(BUDGET_WIDGETS).toMatchObject([{ size: "full", operatorView: "never" }])
    expect(OVERVIEW_VIEWS[BUDGET_WIDGET_IDS.month]).toBe(BUDGET_WIDGET_VIEWS[BUDGET_WIDGET_IDS.month])
  })

  it("names its month and says every budget is on track, at exactly its limit too", () => {
    const drawn = card(result([limitRow(FOOD, 500, 500), limitRow(RENT, 100, 1200)]))

    expect(drawn.line("month")).toBe("November 2026")
    expect(drawn.line("sentence")).toBe("All 2 budgets on track.")
  })

  it("names the one budget over and by how much", () => {
    const drawn = card(result([limitRow(FOOD, 58000, 50000), limitRow(RENT, 100000, 120000)]))

    expect(drawn.line("sentence")).toBe("1 of 2 budgets on track; Food is US$80.00 over.")
  })

  it("names the budget most over and counts the rest when several are over", () => {
    const drawn = card(result([
      limitRow(FOOD, 52000, 50000),
      limitRow(RENT, 150000, 120000),
      limitRow(CAFES, 9000, 5000),
      limitRow(GROCERIES, 100, 5000),
    ]))

    expect(drawn.line("sentence")).toBe(
      "1 of 4 budgets on track; Rent is US$300.00 over, and 2 more.",
    )
  })

  it("counts an envelope with less than nothing left as over, in the main currency", () => {
    const envelope = (available: number, assigned = 0) => ({
      assigned,
      movedIn: 0,
      movedOut: 0,
      spent: assigned - available,
      available,
    })
    const drawn = card(result([
      { ...bareRow(FOOD), envelope: envelope(-3000, 10000) },
      { ...bareRow(RENT), envelope: envelope(500, 120000) },
    ], { method: BudgetMethod.ENVELOPES, envelopeLeftOut: [] }))

    expect(drawn.line("sentence")).toBe("1 of 2 budgets on track; Food is US$30.00 over.")
  })

  it("says the month has no budgets and offers to set one, on the household's Budgets screen", () => {
    const drawn = card(result([bareRow(FOOD, 4000), bareRow(RENT)]))

    expect(drawn.line("none")).toBe("No budgets for November 2026.")
    expect(drawn.line("sentence")).toBe(null)
    expect(drawn.bars).toEqual([])
    expect(drawn.link.textContent).toBe("Set a budget")
    expect(drawn.link.getAttribute("href")).toBe("/budgets?group=g-a&month=2026-11")
  })

  it("names a currency with no rate instead of a sentence that would be untrue", () => {
    const drawn = card(result([
      limitRow(FOOD, 58000, 50000, { leftOut: ["VND"] }),
      limitRow(RENT, 100, 1200, { leftOut: ["VND"] }),
    ]))

    expect(drawn.line("sentence")).toBe(null)
    expect(drawn.line("left-out")).toContain("VND")
    expect(drawn.bars).toEqual([`budget-${FOOD}`, `budget-${RENT}`])
  })

  it("writes no sentence when a figure is past the safe range, and still draws the bars", () => {
    const drawn = card(result([limitRow(FOOD, null, 50000), limitRow(RENT, 100, 1200)]))

    expect(drawn.line("sentence")).toBe(null)
    expect(drawn.bars).toEqual([`budget-${FOOD}`, `budget-${RENT}`])
  })

  it("draws the Budgets screen's bars for the rows with a limit, read-only and flat in the card", () => {
    const drawn = card(result([
      limitRow(FOOD, 58000, 50000),
      bareRow(GROCERIES, 58000, FOOD),
      bareRow(CAFES, 2000),
      limitRow(RENT, 100, 1200),
    ]))

    expect(drawn.bars).toEqual([`budget-${FOOD}`, `budget-${RENT}`])
    expect(drawn.root.querySelector("[data-budget-action], button")).toBe(null)
    // No card inside the overview's card: the list has no border, rounding or padding of its own.
    expect(drawn.root.querySelector("[data-e2e=budgets-list], .pc-card, .rounded-lg")).toBe(null)
    const bar = drawn.root.querySelector(`[data-e2e=budget-${FOOD}]`)!
    expect(bar.className.split(" ")).not.toContain("px-4")
  })

  it("links to that month's Budgets screen of the overview's household, with a touch-sized target", () => {
    const drawn = card(result([limitRow(FOOD, 100, 500)]))

    expect(drawn.link.textContent).toBe("See budgets for November 2026")
    expect(drawn.link.getAttribute("href")).toBe("/budgets?group=g-a&month=2026-11")
    expect(drawn.link.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-11", "sm:min-h-9"]),
    )
    expect(budgetsLinkHref("2026-10")).toBe("/budgets?month=2026-10")
  })

  it("follows its link through the app's navigate, not a page load", async () => {
    const opened: string[] = []
    const drawing = BUDGET_WIDGET_VIEWS[BUDGET_WIDGET_IDS.month].draw(
      result([limitRow(FOOD, 100, 500)]),
      { ...CONTEXT, navigate: (href) => opened.push(href) },
    )
    const root = document.createElement("div")
    document.body.append(root)
    await act(() =>
      render(<I18nContext.Provider value={ENGLISH}>{drawing.content}</I18nContext.Provider>, root)
    )
    const click = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })

    root.querySelector("[data-e2e=budget-widget-link]")!.dispatchEvent(click as unknown as Event)

    expect(opened).toEqual(["/budgets?group=g-a&month=2026-11"])
    expect(click.defaultPrevented).toBe(true)
    await act(() => render(null, root))
    root.remove()
  })

  it("names its loading and failing lines from the catalog", () => {
    const view = BUDGET_WIDGET_VIEWS[BUDGET_WIDGET_IDS.month]
    expect(ENGLISH.t(view.loadingKey)).toBe("Loading the budgets…")
    expect(ENGLISH.t(view.errorKey)).toBe("The budgets could not be loaded.")
  })
})
