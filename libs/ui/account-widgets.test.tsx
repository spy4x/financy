/**
 * "How much do we have?" as a member sees it: the household total worded as the Accounts screen
 * words it, then each live account's balance in its own currency, a line for the archived accounts
 * the total holds, and a link to the Accounts screen. Rendered as server HTML and read in a browser
 * DOM (happy-dom).
 */
import { expect } from "@std/expect"
import { afterAll, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { renderToString } from "preact-render-to-string"
import { FormatContext } from "@spy4x/preact-ui/format"
import { I18nContext } from "@spy4x/preact-ui/i18n"
import { createFormatters } from "@spy4x/time/format"
import {
  ACCOUNT_WIDGET_IDS,
  ACCOUNT_WIDGETS,
  type AccountBalance,
  AccountKind,
  type AccountWidgetResult,
  type HouseholdTotal,
} from "@domain/accounts"
import { overviewPeriods } from "@domain/groups"
import { MONEY_WIDGET_IDS } from "@domain/transactions"
import { ACCOUNT_WIDGET_VIEWS, accountsLinkHref } from "./account-widgets.tsx"
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

const FORMAT = createFormatters({ locale: "en-GB", timeZone: "UTC", hourCycle: null })
const CONTEXT: WidgetDrawContext = {
  periods: overviewPeriods({ from: "2026-11-01", to: "2026-11-30" })!,
  endsToday: true,
  groupId: "g-a",
  format: FORMAT,
}

let next = 0
function account(
  name: string,
  currency: string,
  balance: number,
  extra: Partial<AccountBalance> = {},
): AccountBalance {
  next += 1
  return {
    id: `a-${next}`,
    name,
    kind: AccountKind.BANK,
    currency,
    balance,
    archived: false,
    ...extra,
  }
}

const EXACT: HouseholdTotal = {
  amount: 150_000,
  currency: "EUR",
  rateDate: null,
  coinPriceDate: null,
  leftOut: [],
  tooLarge: false,
}

/** The card body for `data`, drawn and read as a person reads it. */
function card(data: AccountWidgetResult) {
  const drawing = ACCOUNT_WIDGET_VIEWS[ACCOUNT_WIDGET_IDS.balances].draw(data, CONTEXT)
  expect(drawing.status).toBe("ready")
  const html = renderToString(
    <FormatContext.Provider value={FORMAT}>
      <I18nContext.Provider value={ENGLISH}>{drawing.content}</I18nContext.Provider>
    </FormatContext.Provider>,
  )
  const root = document.createElement("div")
  root.innerHTML = html
  // A currency code and its amount sit apart by a no-break space: read it as a plain one.
  const read = (element: Element | null) =>
    element === null ? null : (element.textContent ?? "").replaceAll("\u00a0", " ")
  return {
    root,
    line: (selector: string) => read(root.querySelector(`[data-e2e=${selector}]`)),
    rows: [...root.querySelectorAll("[data-e2e=account-widget-row]")].map((row) => [
      read(row.querySelector("[data-e2e=account-widget-name]")),
      read(row.querySelector("[data-e2e=account-widget-balance]")),
    ]),
    link: root.querySelector<HTMLAnchorElement>("[data-e2e=account-widget-link]"),
  }
}

describe(`the overview's "How much do we have?" widget`, () => {
  it("comes right after where the money went, full width, and never on the operator's page", () => {
    const ids = OVERVIEW_WIDGETS.map((widget) => widget.id)
    expect(ids.indexOf(ACCOUNT_WIDGET_IDS.balances)).toBe(
      ids.indexOf(MONEY_WIDGET_IDS.categories) + 1,
    )
    expect(ACCOUNT_WIDGETS).toMatchObject([{
      size: "full",
      operatorView: "never",
      titleKey: "AccountWidgets.title",
    }])
    expect(ENGLISH.t("AccountWidgets.title")).toBe("How much do we have?")
    expect(OVERVIEW_VIEWS[ACCOUNT_WIDGET_IDS.balances]).toBe(
      ACCOUNT_WIDGET_VIEWS[ACCOUNT_WIDGET_IDS.balances],
    )
  })

  it("shows the exact total, then each live account's balance in its own currency, in the Accounts screen's kind order", () => {
    const c = card({
      accounts: [
        account("Savings pot", "EUR", 100_000, { kind: AccountKind.SAVINGS }),
        account("Wallet", "EUR", 2_550, { kind: AccountKind.CASH }),
        account("Tokyo", "JPY", 5_000),
      ],
      total: EXACT,
    })

    expect(c.line("accounts-total-amount")).toBe("€1,500.00")
    expect(c.line("accounts-total-rates")).toBeNull()
    expect(c.rows).toEqual([
      ["Wallet", "€25.50"],
      ["Tokyo", "JP¥5,000"],
      ["Savings pot", "€1,000.00"],
    ])
    expect(c.line("account-widget-archived")).toBeNull()
  })

  it("says about and names the rate date when a rate was used, and the coin price with CoinGecko's credit", () => {
    const c = card({
      accounts: [account("Wallet", "BTC", 50_000_000, { kind: AccountKind.CRYPTO })],
      total: { ...EXACT, rateDate: "2026-11-06", coinPriceDate: "2026-11-05" },
    })

    expect(c.line("accounts-total-amount")).toBe("about €1,500.00")
    expect(c.line("accounts-total-rates")).toBe("At the exchange rates of 6 Nov 2026")
    expect(c.line("accounts-total-coins")).toBe(
      "Coin prices of 5 Nov 2026. Data provided by CoinGecko.",
    )
    expect(c.rows).toEqual([["Wallet", "BTC 0.50000000"]])
  })

  it("names a currency left out of the total, still lists its account, and shows no figure when none converted", () => {
    const some = card({
      accounts: [account("Main", "EUR", 150_000), account("Tbilisi", "GEL", 9_900)],
      total: { ...EXACT, leftOut: [{ currency: "GEL", accounts: 1 }] },
    })
    expect(some.line("accounts-total-amount")).toBe("€1,500.00")
    expect(some.line("accounts-total-left-out")).toBe(
      "Leaves out 1 account: no exchange rate for GEL yet.",
    )
    expect(some.rows).toContainEqual(["Tbilisi", "GEL 99.00"])

    const none = card({
      accounts: [account("Tbilisi", "GEL", 9_900)],
      total: { ...EXACT, amount: null, leftOut: [{ currency: "GEL", accounts: 1 }] },
    })
    expect(none.line("accounts-total-amount")).toBeNull()
    expect(none.line("accounts-total-left-out")).toBe(
      "Leaves out 1 account: no exchange rate for GEL yet.",
    )
  })

  it("shows no figure for a total too large to hold exactly, and says so", () => {
    const c = card({
      accounts: [account("Main", "EUR", 150_000)],
      total: { ...EXACT, amount: null, tooLarge: true },
    })

    expect(c.line("accounts-total-amount")).toBeNull()
    expect(c.line("accounts-total-too-large")).toBe("The total is too large to show.")
  })

  it("draws a negative balance with its minus sign in the plain colour, never as an error", () => {
    const c = card({
      accounts: [account("Card", "EUR", -12_345, { kind: AccountKind.CARD })],
      total: { ...EXACT, amount: -12_345 },
    })

    expect(c.rows).toEqual([["Card", "-€123.45"]])
    expect(c.root.querySelector("[data-e2e=account-widget-balance] bdi")).not.toBeNull()
    expect(c.root.querySelectorAll(".text-danger, .text-success").length).toBe(0)
  })

  it("leaves archived accounts out of the list and says how many the total holds", () => {
    const c = card({
      accounts: [
        account("Main", "EUR", 100_000),
        account("Old", "EUR", 30_000, { archived: true }),
        account("Older", "EUR", 20_000, { archived: true }),
      ],
      total: EXACT,
    })

    expect(c.rows).toEqual([["Main", "€1,000.00"]])
    expect(c.line("account-widget-archived")).toBe("The total includes 2 archived accounts.")
  })

  it("links to the Accounts screen of the overview's household, with a 44 px target on a phone", () => {
    const c = card({ accounts: [account("Main", "EUR", 150_000)], total: EXACT })

    expect(c.link?.textContent).toBe("See all accounts")
    expect(c.link?.getAttribute("href")).toBe("/accounts?group=g-a")
    expect(c.link?.className).toContain("min-h-11")
    expect(c.link?.className).toContain("sm:min-h-9")
    expect(accountsLinkHref()).toBe("/accounts")
  })

  it("says there are no accounts yet, with the link and no total, for a household with none", () => {
    const c = card({ accounts: [], total: { ...EXACT, amount: 0 } })

    expect(c.line("account-widget-none")).toBe("No accounts yet.")
    expect(c.line("account-widget-total")).toBeNull()
    expect(c.rows).toEqual([])
    expect(c.link?.getAttribute("href")).toBe("/accounts?group=g-a")
  })
})
