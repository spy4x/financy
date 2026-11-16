/**
 * "Where did the money go?" as a member sees it: one sentence names the category that spent most
 * and its share, each top-level category is a row with its amount and share that opens its
 * transactions for the range, "and N more" opens the range's expenses, a converted figure says
 * "about" and names its rate date, and a currency with no rate is named, never counted as zero.
 * Rendered as server HTML and read in a browser DOM (happy-dom).
 */
import { expect } from "@std/expect"
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { renderToString } from "preact-render-to-string"
import { I18nContext } from "@spy4x/preact-ui/i18n"
import { createFormatters } from "@spy4x/time/format"
import { BUDGET_WIDGET_IDS } from "@domain/budgets"
import { overviewPeriods } from "@domain/groups"
import {
  CATEGORY_WIDGETS,
  type CategoryWidgetResult,
  type CategoryWidgetRow,
  MONEY_WIDGET_IDS,
} from "@domain/transactions"
import { CATEGORY_WIDGET_VIEWS, categoryLinkHref, shareOf } from "./category-widgets.tsx"
import { OVERVIEW_VIEWS, OVERVIEW_WIDGETS } from "./overview-widgets.ts"
import type { WidgetDrawContext } from "./note-widgets.tsx"
import { ENGLISH } from "./i18n-testing.ts"

const window = new Window({ url: "http://app.localhost/" })
const own = { document: globalThis.document, location: globalThis.location }

beforeAll(() => {
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
const ID = (n: number) => `019a5b0e-1af5-7f04-8ae4-b1ee5d1140${String(n).padStart(2, "0")}`

function row(n: number, name: string, spending: number, converted = false): CategoryWidgetRow {
  return { categoryId: ID(n), name, spending, converted }
}

/** A month in EUR with nothing converted and nothing left out, changed by `extra`. */
function result(extra: Partial<CategoryWidgetResult> = {}): CategoryWidgetResult {
  return {
    currency: "EUR",
    total: 100000,
    converted: false,
    top: [row(1, "Rent", 40000), row(2, "Food", 30000), row(3, "Travel", 20000)],
    more: 0,
    spendingLeftOut: [],
    spendingRateDate: null,
    tooLarge: false,
    ...extra,
  }
}

/** The card body for `data`, drawn and read as a person reads it. */
function card(data: CategoryWidgetResult, context = CONTEXT) {
  const drawing = CATEGORY_WIDGET_VIEWS[MONEY_WIDGET_IDS.categories].draw(data, context)
  expect(drawing.status).toBe("ready")
  const html = renderToString(
    <I18nContext.Provider value={ENGLISH}>{drawing.content}</I18nContext.Provider>,
  )
  const root = document.createElement("div")
  root.innerHTML = html
  // Names and amounts sit in their own direction (FSI … PDI): the text is what is around them.
  const read = (element: Element | null) =>
    element === null ? null : (element.textContent ?? "").replaceAll(/[⁨⁩]/g, "")
  const rows = [...root.querySelectorAll("[data-e2e=category-widget-rows] tbody tr")]
  return {
    root,
    line: (name: string) => read(root.querySelector(`[data-e2e=category-widget-${name}]`)),
    rows: rows.map((tr) => ({
      name: read(tr.querySelector("th a")),
      href: tr.querySelector("th a")?.getAttribute("href") ?? null,
      cells: [...tr.querySelectorAll("td")].map((td) => read(td)),
    })),
    more: root.querySelector<HTMLAnchorElement>("[data-e2e=category-widget-more]"),
  }
}

describe(`the overview's "Where did the money go?" widget`, () => {
  it("comes right after the budgets widget, full width, and never on the operator's page", () => {
    const ids = OVERVIEW_WIDGETS.map((widget) => widget.id)
    expect(ids.indexOf(MONEY_WIDGET_IDS.categories)).toBe(
      ids.indexOf(BUDGET_WIDGET_IDS.month) + 1,
    )
    expect(CATEGORY_WIDGETS).toMatchObject([{ size: "full", operatorView: "never" }])
    expect(OVERVIEW_VIEWS[MONEY_WIDGET_IDS.categories]).toBe(
      CATEGORY_WIDGET_VIEWS[MONEY_WIDGET_IDS.categories],
    )
  })

  it("names the category that spent most and its share, then a row per category with amount and share", () => {
    const c = card(result())

    expect(c.line("sentence")).toBe("Most went to Rent: 40% of the spending in your categories.")
    expect(c.rows.map(({ name, cells }) => ({ name, cells }))).toEqual([
      { name: "Rent", cells: ["€400.00", "40%"] },
      { name: "Food", cells: ["€300.00", "30%"] },
      { name: "Travel", cells: ["€200.00", "20%"] },
    ])
    expect(c.more).toBeNull()
    expect(c.line("rates")).toBeNull()
  })

  it("links each row to its category's transactions for the range in the overview's household", () => {
    const c = card(result())

    expect(c.rows[0].href).toBe(
      `/transactions?group=g-a&category=${ID(1)}&from=2026-11-01&to=2026-11-30`,
    )
    expect(categoryLinkHref(ID(2), { from: "2026-10-01", to: "2026-10-31" })).toBe(
      `/transactions?category=${ID(2)}&from=2026-10-01&to=2026-10-31`,
    )
  })

  it("writes a sliver of spending as less than 1%, rounded down, never as 0%", () => {
    const c = card(result({
      total: 1_000_000,
      top: [row(1, "Rent", 995_000), row(2, "Stamps", 5_000)],
    }))

    expect(c.rows.map((r) => r.cells[1])).toEqual(["99%", "less than 1%"])
    expect(shareOf(1, 0)).toBeNull()
    expect(shareOf(1, -5)).toBeNull()
  })

  it("draws the five it gets, then 'And N more categories' to the range's expenses", () => {
    const top = [1, 2, 3, 4, 5].map((n) => row(n, `Category ${n}`, 1000 * (6 - n)))
    const c = card(result({ total: 20000, top, more: 3 }))

    expect(c.rows).toHaveLength(5)
    expect(c.more?.textContent).toBe("And 3 more categories")
    expect(c.more?.getAttribute("href")).toBe(
      "/transactions?group=g-a&kind=1&from=2026-11-01&to=2026-11-30",
    )
    expect(card(result({ more: 1 })).more?.textContent).toBe("And 1 more category")
  })

  it("says about only on the rows that were converted, and on the sentence, with the rate date", () => {
    const c = card(result({
      converted: true,
      spendingRateDate: "2026-11-14",
      top: [row(1, "Rent", 40000), row(2, "Food", 30000, true), row(3, "Travel", 20000)],
    }))

    expect(c.line("sentence")).toBe(
      "Most went to Rent: about 40% of the spending in your categories.",
    )
    expect(c.rows.map((r) => r.cells[0])).toEqual(["€400.00", "about €300.00", "€200.00"])
    expect(c.line("rates")).toBe(
      "Converted at each day's exchange rate, the latest from 14 Nov",
    )
  })

  it("says no about and names no rate date when no listed spending was converted", () => {
    const c = card(result({ spendingRateDate: "2026-11-14" }))

    expect(c.line("sentence")).toBe("Most went to Rent: 40% of the spending in your categories.")
    expect(c.rows[0].cells[0]).toBe("€400.00")
    expect(c.line("rates")).toBeNull()
  })

  it("never shows a share past 100% when a refund-only category leaves the total", () => {
    // Rent spent €20.00 and Food was only refunded €15.00: the total holds Rent's alone.
    const c = card(result({ total: 2000, top: [row(1, "Rent", 2000)] }))

    expect(c.line("sentence")).toBe("Most went to Rent: 100% of the spending in your categories.")
    expect(c.rows[0].cells).toEqual(["€20.00", "100%"])
  })

  it("hides every share while a currency is left out, and names the top of what it could count", () => {
    const c = card(result({ spendingLeftOut: ["THB"] }))

    expect(c.line("left-out")).toBe(
      "Leaves out spending in THB: no exchange rate for it yet.",
    )
    expect(c.line("sentence")).toBe("Most of the spending we could count went to Rent.")
    expect(c.rows.map((r) => r.cells)).toEqual([
      ["€400.00", "–"],
      ["€300.00", "–"],
      ["€200.00", "–"],
    ])
    expect(c.root.textContent).not.toMatch(/\d%/)
  })

  it("shows no number at all when every entry lacked a rate", () => {
    const c = card(result({ total: 0, top: [], spendingLeftOut: ["THB", "USD"] }))

    expect(c.rows).toEqual([])
    expect(c.line("none")).toBeNull()
    expect(c.line("left-out")).toBe(
      "Leaves out spending in THB and USD: no exchange rate for them yet.",
    )
    expect(c.root.textContent).not.toMatch(/€|\d%/)
  })

  it("says the spending is too large to show, with no row or sentence", () => {
    const c = card(result({ total: null, top: [], tooLarge: true }))

    expect(c.line("too-large")).toBe("The spending is too large to show.")
    expect(c.rows).toEqual([])
    expect(c.line("sentence")).toBeNull()
  })

  it("says there was no spending in the range when no category spent", () => {
    const c = card(result({ total: 0, top: [] }))

    expect(c.line("none")).toBe("No spending in this range")
    expect(c.line("sentence")).toBeNull()
    expect(c.rows).toEqual([])
  })

  it("never cuts a long category name or shortens a long amount", () => {
    const name = "Household repairs, garden tools and everything for the summer house"
    const c = card(result({
      currency: "VND",
      total: 123_456_789_000,
      top: [row(1, name, 123_456_789_000)],
    }))

    expect(c.rows[0].name).toBe(name)
    expect(c.rows[0].cells[0]).toBe("₫123,456,789,000")
    // RankedBars clamps a label to two lines; the card lifts the clamp.
    expect(c.root.querySelector("[data-e2e=category-widget-rows] > div")?.className).toContain(
      "[&_.line-clamp-2]:line-clamp-none",
    )
  })
})
