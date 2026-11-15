/** The admin Budgets screen in a browser DOM (happy-dom): its counts, its states and its links. */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { FormatContext } from "@spy4x/preact-ui/format"
import { createFormatters } from "@spy4x/time/format"
import { type AdminBudgetsOverview, BudgetMethod } from "@domain/budgets"
import { AdminBudgetsScreen } from "./admin-budgets-screen.tsx"

const window = new Window({ url: "http://admin.localhost/budgets" })
const own = { document: globalThis.document, location: globalThis.location }

beforeAll(() => {
  Object.assign(globalThis, { document: window.document, location: window.location })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

let root: HTMLElement | null = null

afterEach(async () => {
  if (root) await act(() => render(null, root!))
  document.body.innerHTML = ""
  root = null
})

const format = createFormatters({
  locale: "en-GB",
  timeZone: "America/Los_Angeles",
  hourCycle: null,
})

async function mount(node: VNode): Promise<void> {
  root = document.createElement("div")
  document.body.append(root)
  await act(() =>
    render(<FormatContext.Provider value={format}>{node}</FormatContext.Provider>, root!)
  )
}

function text(selector: string): string {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  return element.textContent ?? ""
}

const home = "019a0000-0000-7000-8000-000000000001"
const flat = "019a0000-0000-7000-8000-000000000002"
const overview: AdminBudgetsOverview = {
  month: `2026-11`,
  households: 2,
  categories: 1234,
  envelopeHouseholds: 1,
  topHouseholds: [
    {
      groupId: home,
      groupName: "Home",
      categories: 1234,
      method: BudgetMethod.LIMITS,
      lastChangeDate: `2026-11-01`,
    },
    {
      groupId: flat,
      groupName: "Flat",
      categories: 1,
      method: BudgetMethod.ENVELOPES,
      lastChangeDate: `2026-10-31`,
    },
  ],
}

describe("AdminBudgetsScreen", () => {
  it("shows the month, the totals and each household's count, method and day, linked to its page", async () => {
    await mount(<AdminBudgetsScreen overview={overview} error={null} onRetry={() => {}} />)

    expect(text("[data-e2e=admin-budgets-month]")).toBe("Month counted: November 2026, UTC")
    const stats = text("[data-e2e=admin-budgets-stats]")
    expect(stats).toContain("Households with limits2")
    expect(stats).toContain("Categories with a limit1,234")
    expect(stats).toContain("On envelopes1")
    const rows = [...document.querySelectorAll("[data-e2e=admin-budgets-households] li")]
      .map((row) => row.textContent)
    // A date-only value is a calendar day: it shows as itself in every time zone.
    expect(rows).toEqual([
      "HomeMonthly limits1,234 categories with a limitLatest change 1 Nov 2026",
      "FlatEnvelopes1 category with a limitLatest change 31 Oct 2026",
    ])
    const links = [...document.querySelectorAll("[data-e2e=admin-budgets-households] a")]
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/groups/${home}`,
      `/groups/${flat}`,
    ])
  })

  it("draws no amount, currency or category name, even when the answer carries them", async () => {
    // The server never sends these; a screen that printed whatever it got would show them.
    const leaky = {
      ...overview,
      amount: 987654321,
      currency: "JPY",
      topHouseholds: overview.topHouseholds.map((household) => ({
        ...household,
        amount: 987654321,
        currency: "JPY",
        categoryName: "SECRET-CATEGORY-286",
      })),
    } as AdminBudgetsOverview
    await mount(<AdminBudgetsScreen overview={leaky} error={null} onRetry={() => {}} />)

    const html = document.body.innerHTML
    expect(html).toContain("Home")
    expect(html).not.toContain("SECRET-CATEGORY-286")
    expect(html).not.toContain("987654321")
    expect(html).not.toContain("987,654,321")
    expect(html).not.toContain("JPY")
  })

  it("says the page shows counts only, in a wrapping paragraph under the title", async () => {
    await mount(<AdminBudgetsScreen overview={overview} error={null} onRetry={() => {}} />)

    const intro = document.querySelector("[data-e2e=admin-budgets-intro]")
    expect(intro?.tagName).toBe("P")
    expect(intro?.textContent).toContain("no amounts, currencies or category names")
  })

  it("shows an empty state instead of the list when no household has set a budget", async () => {
    await mount(
      <AdminBudgetsScreen
        overview={{
          month: `2026-11`,
          households: 0,
          categories: 0,
          envelopeHouseholds: 0,
          topHouseholds: [],
        }}
        error={null}
        onRetry={() => {}}
      />,
    )

    expect(text("[data-e2e=admin-budgets-empty]")).toContain("No budgets yet")
    expect(document.querySelector("[data-e2e=admin-budgets-stats]")).toBe(null)
    expect(document.querySelector("[data-e2e=admin-budgets-households]")).toBe(null)
  })

  it("says it is loading until the counts arrive, and offers a retry when they fail", async () => {
    await mount(<AdminBudgetsScreen overview={null} error={null} onRetry={() => {}} />)
    expect(document.querySelector("[data-e2e=admin-budgets-loading]")).not.toBe(null)

    let retried = 0
    await mount(
      <AdminBudgetsScreen overview={null} error="Server error" onRetry={() => retried++} />,
    )
    expect(text("[data-e2e=admin-budgets-error]")).toContain("Server error")
    await act(() => {
      ;[...document.querySelectorAll("button")].at(-1)!.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
      )
    })
    expect(retried).toBe(1)
  })
})
