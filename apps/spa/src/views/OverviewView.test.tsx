/**
 * The member's overview page around its money cards: no "No notes yet" card above a household's
 * figures, and card links that name the overview's own household.
 */
import { expect } from "@std/expect"
import { afterEach, describe, it } from "@std/testing/bdd"
import { renderToString } from "preact-render-to-string"
import { Router } from "wouter-preact"
import { ACCOUNT_WIDGET_IDS, AccountKind, type AccountWidgetResult } from "@domain/accounts"
import { BUDGET_WIDGET_IDS, BudgetMethod, type BudgetWidgetResult } from "@domain/budgets"
import { GroupRole } from "@domain/groups"
import { NOTE_WIDGET_IDS } from "@domain/notes"
import {
  type CategoryWidgetResult,
  type LedgerFigures,
  MONEY_WIDGET_IDS,
} from "@domain/transactions"
import { OVERVIEW_PATHS } from "@ui/progressive.tsx"
import { groupsStore } from "../state/groups.ts"
import { overviewStore } from "../state/overview.ts"
import { selectionStore } from "../state/selection.ts"
import { OverviewView } from "./OverviewView.tsx"

const A = "019a0000-0000-7000-8000-00000000000a"
const B = "019a0000-0000-7000-8000-00000000000b"

afterEach(() => {
  groupsStore.reset()
  overviewStore.reset()
  selectionStore.groupId.value = null
})

/** A ledger of the range in EUR with nothing in it. */
const EMPTY: LedgerFigures = {
  currency: "EUR",
  from: "2026-11-01",
  to: "2026-11-30",
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
}

/** November with no budget set. */
const NO_BUDGETS: BudgetWidgetResult = {
  budgets: {
    month: "2026-11",
    from: "2026-11-01",
    to: "2026-11-30",
    baseCurrency: "EUR",
    rows: [],
    method: BudgetMethod.LIMITS,
    methodVersion: null,
  },
  categories: [],
}

/** One category that spent, and one more behind "and N more". */
const WHERE_IT_WENT: CategoryWidgetResult = {
  currency: `EUR`,
  total: 1500,
  converted: false,
  top: [{
    categoryId: `019a5b0e-1af5-7f04-8ae4-b1ee5d114001`,
    name: `Rent`,
    spending: 1000,
    converted: false,
  }],
  more: 1,
  spendingLeftOut: [],
  spendingRateDate: null,
  tooLarge: false,
}

/** One euro account. */
const BALANCES: AccountWidgetResult = {
  accounts: [{
    id: `019a5b0e-1af5-7f04-8ae4-b1ee5d114101`,
    name: `Main`,
    kind: AccountKind.BANK,
    currency: `EUR`,
    balance: 1500,
    archived: false,
  }],
  total: {
    amount: 1500,
    currency: `EUR`,
    rateDate: null,
    coinPriceDate: null,
    leftOut: [],
    tooLarge: false,
  },
}

/**
 * Household A's overview, with B selected, its notes count 0 and its money, budgets, where the
 * money went and its balances loaded.
 */
function overviewOfA(): string {
  groupsStore.groups.value = [
    { id: A, name: `Home`, role: GroupRole.OWNER },
    { id: B, name: `Work`, role: GroupRole.OWNER },
  ] as unknown as typeof groupsStore.groups.value
  selectionStore.groupId.value = B
  const ready = (data: unknown) => ({ status: "ready" as const, data, savedAt: null })
  overviewStore.loads.value = {
    [NOTE_WIDGET_IDS.total]: ready({ current: 0, previous: null }),
    [MONEY_WIDGET_IDS.net]: ready({ current: EMPTY, previous: null }),
    [MONEY_WIDGET_IDS.income]: ready({ current: EMPTY, previous: null }),
    [MONEY_WIDGET_IDS.spending]: ready({ current: EMPTY, previous: null }),
    [BUDGET_WIDGET_IDS.month]: ready(NO_BUDGETS),
    [MONEY_WIDGET_IDS.categories]: ready(WHERE_IT_WENT),
    [ACCOUNT_WIDGET_IDS.balances]: ready(BALANCES),
  }
  return renderToString(
    <Router ssrPath={OVERVIEW_PATHS.group(A)}>
      <OverviewView groupId={A} />
    </Router>,
  )
}

describe("the overview with its money cards", () => {
  it("shows no 'No notes yet' card above the money cards of a household with no notes", () => {
    const html = overviewOfA()

    expect(html).toContain(`data-e2e="overview-widget-${MONEY_WIDGET_IDS.net}"`)
    expect(html).not.toContain(`data-e2e="overview-empty-group"`)
  })

  it("links each money card and each category row to the overview's household, not the selected one", () => {
    const hrefs = [...overviewOfA().matchAll(/href="(\/transactions[^"]*)"/g)].map((m) => m[1])

    // Net, Income, Spending, the one category row and "and 1 more".
    expect(hrefs.length).toBe(5)
    for (const href of hrefs) expect(href).toContain(`group=${A}`)
  })

  it("puts the budgets card after the money cards and before where the money went, linked to the overview's household and month", () => {
    const html = overviewOfA()
    const at = (id: string) => html.indexOf(`data-e2e="overview-widget-${id}"`)

    expect(at(BUDGET_WIDGET_IDS.month)).toBeGreaterThan(at(MONEY_WIDGET_IDS.spending))
    expect(at(MONEY_WIDGET_IDS.spending)).toBeGreaterThan(-1)
    expect(at(MONEY_WIDGET_IDS.categories)).toBeGreaterThan(at(BUDGET_WIDGET_IDS.month))
    expect(html).not.toContain(`data-e2e="overview-empty-group"`)
    expect([...html.matchAll(/href="(\/budgets[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&")))
      .toEqual([`/budgets?group=${A}&month=2026-11`])
  })

  it("puts the balances card last of the money cards, before the notes, linked to the overview's household", () => {
    const html = overviewOfA()
    const at = (id: string) => html.indexOf(`data-e2e="overview-widget-${id}"`)

    expect(at(ACCOUNT_WIDGET_IDS.balances)).toBeGreaterThan(at(MONEY_WIDGET_IDS.categories))
    expect(at(MONEY_WIDGET_IDS.categories)).toBeGreaterThan(-1)
    expect(at(NOTE_WIDGET_IDS.total)).toBeGreaterThan(at(ACCOUNT_WIDGET_IDS.balances))
    expect([...html.matchAll(/href="(\/accounts[^"]*)"/g)].map((m) => m[1]))
      .toEqual([`/accounts?group=${A}`])
  })
})
