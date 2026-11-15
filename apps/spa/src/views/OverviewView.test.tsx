/**
 * The member's overview page around its money cards: no "No notes yet" card above a household's
 * figures, and card links that name the overview's own household.
 */
import { expect } from "@std/expect"
import { afterEach, describe, it } from "@std/testing/bdd"
import { renderToString } from "preact-render-to-string"
import { Router } from "wouter-preact"
import { BUDGET_WIDGET_IDS, BudgetMethod, type BudgetWidgetResult } from "@domain/budgets"
import { GroupRole } from "@domain/groups"
import { NOTE_WIDGET_IDS } from "@domain/notes"
import { type LedgerFigures, MONEY_WIDGET_IDS } from "@domain/transactions"
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

/** Household A's overview, with B selected, its notes count 0 and its money and budgets loaded. */
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

  it("links each money card to the overview's household, not the selected one", () => {
    const hrefs = [...overviewOfA().matchAll(/href="(\/transactions[^"]*)"/g)].map((m) => m[1])

    expect(hrefs.length).toBe(3)
    for (const href of hrefs) expect(href).toContain(`group=${A}`)
  })

  it("puts the budgets card after the money cards, linked to the overview's household and month", () => {
    const html = overviewOfA()
    const at = (id: string) => html.indexOf(`data-e2e="overview-widget-${id}"`)

    expect(at(BUDGET_WIDGET_IDS.month)).toBeGreaterThan(at(MONEY_WIDGET_IDS.spending))
    expect(at(MONEY_WIDGET_IDS.spending)).toBeGreaterThan(-1)
    expect(html).not.toContain(`data-e2e="overview-empty-group"`)
    expect([...html.matchAll(/href="(\/budgets[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&")))
      .toEqual([`/budgets?group=${A}&month=2026-11`])
  })
})
