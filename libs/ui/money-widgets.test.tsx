/**
 * The overview's money widgets (Net, Income, Spending) as a member sees them: the figure is the
 * ledger read's, words come before the number, a converted figure says "about" and names its rate
 * date, a currency with no rate is named, and each card links to the same range's transactions.
 * Rendered as server HTML and read in a browser DOM (happy-dom).
 */
import { expect } from "@std/expect"
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { renderToString } from "preact-render-to-string"
import { I18nContext } from "@spy4x/preact-ui/i18n"
import { createFormatters } from "@spy4x/time/format"
import { overviewPeriods } from "@domain/groups"
import { type LedgerFigures, MONEY_WIDGET_IDS, MONEY_WIDGETS } from "@domain/transactions"
import { MONEY_WIDGET_VIEWS } from "./money-widgets.tsx"
import { OVERVIEW_VIEWS, OVERVIEW_WIDGETS } from "./overview-widgets.ts"
import type { WidgetDrawContext } from "./note-widgets.tsx"
import { ENGLISH } from "./i18n-testing.ts"

const window = new Window({ url: "http://app.localhost/" })
const own = { document: globalThis.document }

beforeAll(() => {
  Object.assign(globalThis, { document: window.document })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

const NOVEMBER = { from: "2026-11-01", to: "2026-11-30" }
const CONTEXT: WidgetDrawContext = {
  periods: overviewPeriods(NOVEMBER)!,
  endsToday: true,
  format: createFormatters({ locale: "en-GB", timeZone: "UTC", hourCycle: null }),
}
const { net, income, spending } = MONEY_WIDGET_IDS

/** A ledger of November in EUR with nothing in it, changed by `parts`. */
function ledger(parts: Partial<LedgerFigures> = {}): LedgerFigures {
  return {
    currency: "EUR",
    ...NOVEMBER,
    income: 0,
    spending: 0,
    net: 0,
    leftOut: [],
    incomeLeftOut: [],
    spendingLeftOut: [],
    rateDate: null,
    incomeRateDate: null,
    spendingRateDate: null,
    tooLarge: false,
    ...parts,
  }
}

/** Ledger figures with every rate date set, as when every sum converted something. */
const CONVERTED = {
  rateDate: "2026-11-14",
  incomeRateDate: "2026-11-12",
  spendingRateDate: "2026-11-14",
}

/** The card body of widget `id` for `current` and `previous`, drawn and read as a person reads it. */
function card(id: string, current: LedgerFigures, previous: LedgerFigures | null = null) {
  const drawing = MONEY_WIDGET_VIEWS[id].draw({ current, previous }, CONTEXT)
  expect(drawing.status).toBe("ready")
  const html = renderToString(
    <I18nContext.Provider value={ENGLISH}>{drawing.content}</I18nContext.Provider>,
  )
  const root = document.createElement("div")
  root.innerHTML = html
  // Amounts and codes sit in their own direction (FSI … PDI): the sentence is the text around them.
  const read = (element: Element | null) =>
    element === null ? null : (element.textContent ?? "").replaceAll(/[⁨⁩]/g, "")
  return {
    html,
    figure: read(root.querySelector("p.tabular-nums")),
    about: root.querySelector("p.tabular-nums")?.getAttribute("aria-label")?.replaceAll(
      /[\u2068\u2069]/g,
      "",
    ) ?? null,
    line: (name: string) => read(root.querySelector(`[data-e2e=money-widget-${name}]`)),
    link: root.querySelector<HTMLAnchorElement>("[data-e2e=money-widget-link]")!,
  }
}

describe("the overview's money widgets", () => {
  it("come first on the overview, in the order Net, Income, Spending, and never on the operator's page", () => {
    expect(OVERVIEW_WIDGETS.slice(0, 3).map((widget) => widget.id)).toEqual([net, income, spending])
    expect(MONEY_WIDGETS.every((widget) => widget.operatorView === "never")).toBe(true)
    for (const { id } of MONEY_WIDGETS) expect(OVERVIEW_VIEWS[id]).toBe(MONEY_WIDGET_VIEWS[id])
  })

  it("draws each card's figure from the ledger read for a month of EUR, USD and VND (legacy §4 item 2)", () => {
    const month = ledger({ income: 300000, spending: 12700, net: 287300, ...CONVERTED })

    expect(card(income, month).figure).toBe("€3,000.00")
    expect(card(spending, month).figure).toBe("€127.00")
    expect(card(net, month).figure).toBe("€2,873.00")
  })

  it("says about and names the newest rate date on a converted figure only (R6)", () => {
    const converted = card(spending, ledger({ spending: 12700, net: -12700, ...CONVERTED }))
    expect(converted.about).toBe("about €127.00")
    expect(converted.line("rates")).toBe(
      "Converted at each day's exchange rate, the latest from 14 Nov",
    )
    // The income was all in the base currency, so its card neither says about nor names a date.
    const plain = card(
      income,
      ledger({ income: 5000, net: 5000, rateDate: "2026-11-14", spendingRateDate: "2026-11-14" }),
    )
    expect(plain.about).toBe(null)
    expect(plain.line("rates")).toBe(null)
  })

  it("writes the rate's year when it is not the range's", () => {
    const old = card(
      income,
      ledger({ income: 5000, net: 5000, rateDate: "2025-12-31", incomeRateDate: "2025-12-31" }),
    )
    expect(old.line("rates")).toContain("31 Dec 2025")
  })

  it("names one currency with no rate, and several, and never shows them as zero (R8)", () => {
    const one = card(
      spending,
      ledger({ spending: 1200, net: -1200, leftOut: ["THB"], spendingLeftOut: ["THB"] }),
    )
    expect(one.figure).toBe("€12.00")
    expect(one.line("left-out")).toBe("Leaves out spending in THB: no exchange rate for it yet.")

    const two = card(
      income,
      ledger({ income: 500, net: 500, leftOut: ["LAK", "THB"], incomeLeftOut: ["LAK", "THB"] }),
    )
    expect(two.line("left-out")).toBe(
      "Leaves out income in LAK and THB: no exchange rate for them yet.",
    )
    // The spending card is not affected by the income's missing rates.
    expect(card(spending, ledger({ leftOut: ["THB"], incomeLeftOut: ["THB"] })).line("left-out"))
      .toBe(null)
  })

  it("shows no figure when every entry lacked a rate, only what was left out", () => {
    const all = card(spending, ledger({ leftOut: ["THB"], spendingLeftOut: ["THB"] }))
    expect(all.figure).toBe(null)
    expect(all.line("none")).toBe(null)
    expect(all.line("left-out")).toBe("Leaves out spending in THB: no exchange rate for it yet.")

    const net0 = card(net, ledger({ leftOut: ["THB"], incomeLeftOut: ["THB"] }))
    expect(net0.figure).toBe(null)
    expect(net0.line("sentence")).toBe(null)
    expect(net0.line("left-out")).toBe(
      "Leaves out income and spending in THB: no exchange rate for it yet.",
    )
  })

  it("shows no figure and says so when the sum is too large", () => {
    const huge = ledger({ income: null, spending: null, net: null, tooLarge: true })
    for (const [id, words] of [[net, "net"], [income, "income"], [spending, "spending"]]) {
      const drawn = card(id, huge)
      expect(drawn.figure).toBe(null)
      expect(drawn.line("too-large")).toBe(`The ${words} is too large to show.`)
    }
  })

  it("shows a real zero and says the range had none", () => {
    expect(card(income, ledger())).toMatchObject({ figure: "€0.00" })
    expect(card(income, ledger()).line("none")).toBe("No income in this range")
    expect(card(spending, ledger()).line("none")).toBe("No spending in this range")
    expect(card(net, ledger()).line("none")).toBe("No income or spending in this range")
    expect(card(net, ledger()).line("sentence")).toBe(null)
  })

  it("compares with the period before in words, with a typographic minus and no colour or arrow", () => {
    const now = ledger({ spending: 12700, net: -12700 })
    const up = card(spending, now, ledger({ spending: 11500, net: -11500 }))
    expect(up.line("change")).toBe("+€12.00 vs previous 30 days")

    const down = card(net, now, ledger({ spending: 11500, net: -11500 }))
    expect(down.figure).toBe("−€127.00")
    expect(down.line("change")).toBe("−€12.00 vs previous 30 days")
    expect(down.html).not.toMatch(/text-(success|danger|green|red)|[↑↓▲▼]/)

    expect(card(spending, now, now).line("change")).toBe("No change vs previous 30 days")
  })

  it("leaves the comparison out when the household has no entries as old as the period before", () => {
    expect(card(spending, ledger({ spending: 12700, net: -12700 }), null).line("change")).toBe(null)
  })

  it("says what was kept, rounding the share down and calling a sliver less than 1%", () => {
    const kept = card(net, ledger({ income: 100000, spending: 88950, net: 11050 }))
    expect(kept.line("sentence")).toBe("You kept €110.50 of €1,000.00 (11%).")
    expect(card(net, ledger({ income: 1000, spending: 1, net: 999 })).line("sentence")).toBe(
      "You kept €9.99 of €10.00 (99%).",
    )
    expect(card(net, ledger({ income: 100000, spending: 99950, net: 50 })).line("sentence")).toBe(
      "You kept €0.50 of €1,000.00 (less than 1%).",
    )
  })

  it("says by how much the spending passed the income, that there was no income, or that both were even", () => {
    expect(card(net, ledger({ income: 1000, spending: 1500, net: -500 })).line("sentence")).toBe(
      "You spent €5.00 more than your income.",
    )
    expect(card(net, ledger({ spending: 1500, net: -1500 })).line("sentence")).toBe(
      "You spent €15.00 and had no income in this range.",
    )
    expect(card(net, ledger({ income: 1500, spending: 1500 })).line("sentence")).toBe(
      "You spent exactly your income of €15.00.",
    )
  })

  it("says about in each sentence when a sum was converted", () => {
    const about = (parts: Partial<LedgerFigures>) =>
      card(net, ledger({ ...parts, ...CONVERTED })).line("sentence")
    expect(about({ income: 100000, spending: 88950, net: 11050 })).toBe(
      "You kept about €110.50 of €1,000.00 (11%).",
    )
    expect(about({ income: 100000, spending: 99950, net: 50 })).toBe(
      "You kept about €0.50 of €1,000.00 (less than 1%).",
    )
    expect(about({ income: 1000, spending: 1500, net: -500 })).toBe(
      "You spent about €5.00 more than your income.",
    )
    expect(about({ spending: 1500, net: -1500 })).toBe(
      "You spent about €15.00 and had no income in this range.",
    )
    expect(about({ income: 1500, spending: 1500 })).toBe(
      "You spent about all of your income of €15.00.",
    )
  })

  it("says about in the sentence when only the income, or only the spending, was converted", () => {
    const figures = { income: 100000, spending: 88950, net: 11050, rateDate: "2026-11-14" }
    const sentence = (parts: Partial<LedgerFigures>) =>
      card(net, ledger({ ...figures, ...parts })).line("sentence")
    expect(sentence({ incomeRateDate: "2026-11-14" })).toBe(
      "You kept about €110.50 of €1,000.00 (11%).",
    )
    expect(sentence({ spendingRateDate: "2026-11-14" })).toBe(
      "You kept about €110.50 of €1,000.00 (11%).",
    )
  })

  it("writes no sentence when a currency was left out of the income or the spending", () => {
    const noRateIncome = card(
      net,
      ledger({ spending: 120000, net: -120000, leftOut: ["USD"], incomeLeftOut: ["USD"] }),
    )
    expect(noRateIncome.line("sentence")).toBe(null)
    expect(noRateIncome.line("left-out")).not.toBe(null)
    const noRateSpending = card(
      net,
      ledger({ income: 300000, net: 300000, leftOut: ["VND"], spendingLeftOut: ["VND"] }),
    )
    expect(noRateSpending.line("sentence")).toBe(null)
    expect(noRateSpending.line("left-out")).not.toBe(null)
  })

  it("links each card to the same days' transactions, income, expenses or all, with a touch-sized target", () => {
    const month = ledger()
    const href = (id: string) => card(id, month).link.getAttribute("href")
    expect(href(income)).toBe("/transactions?kind=2&from=2026-11-01&to=2026-11-30")
    expect(href(spending)).toBe("/transactions?kind=1&from=2026-11-01&to=2026-11-30")
    expect(href(net)).toBe("/transactions?from=2026-11-01&to=2026-11-30")
    expect(card(net, month).link.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-11", "sm:min-h-9"]),
    )
    expect(card(net, month).link.textContent).toBe("See all transactions in this range")
  })

  it("names its loading and failing lines from the catalog, per card", () => {
    expect(ENGLISH.t(MONEY_WIDGET_VIEWS[net].loadingKey)).toBe("Loading the net…")
    expect(ENGLISH.t(MONEY_WIDGET_VIEWS[income].errorKey)).toBe("The income could not be loaded.")
    expect(ENGLISH.t(MONEY_WIDGET_VIEWS[spending].loadingKey)).toBe("Loading the spending…")
  })
})
