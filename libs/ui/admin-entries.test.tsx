/** The admin Entries screen in a browser DOM (happy-dom): its counts, its states and its links. */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { FormatContext } from "@spy4x/preact-ui/format"
import { createFormatters } from "@spy4x/time/format"
import type { AdminEntriesOverview } from "@domain/transactions"
import { AdminEntriesScreen } from "./admin-entries-screen.tsx"

const window = new Window({ url: "http://admin.localhost/entries" })
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

const groupId = "019a0000-0000-7000-8000-000000000001"
const months = [`2026-06`, `2026-07`, `2026-08`, `2026-09`, `2026-10`, `2026-11`]
const overview: AdminEntriesOverview = {
  entries: 1234,
  households: 2,
  lastEntryDate: `2026-11-01`,
  months: months.map((month, index) => ({ month, entries: index, households: index ? 1 : 0 })),
  topHouseholds: [{
    groupId,
    groupName: "Home",
    entries: 1230,
    months: [0, 1, 2, 3, 4, 5],
    lastEntryDate: `2026-11-01`,
  }],
}

describe("AdminEntriesScreen", () => {
  it("shows the totals, the six months and each household's months, linked to its page", async () => {
    await mount(<AdminEntriesScreen overview={overview} error={null} onRetry={() => {}} />)

    const stats = text("[data-e2e=admin-entries-stats]")
    expect(stats).toContain("Entries1,234")
    expect(stats).toContain("Households2")
    // A date-only value is a calendar day: it shows as itself in every time zone.
    expect(stats).toContain("Latest entry1 Nov 2026")
    const byMonth = [...document.querySelectorAll("[data-e2e=admin-entries-months] dt")]
      .map((row) => row.textContent)
    expect(byMonth).toEqual([
      "June 2026",
      "July 2026",
      "August 2026",
      "September 2026",
      "October 2026",
      "November 2026",
    ])
    expect(text("[data-e2e=admin-entries-months]")).toContain("November 20265 entries1 household")
    expect(text("[data-e2e=admin-entries-months]")).toContain("June 20260 entries0 households")
    const households = text("[data-e2e=admin-entries-households]")
    expect(households).toContain("1,230 entries")
    expect(households).toContain("Latest entry 1 Nov 2026")
    const cells = [...document.querySelectorAll("[data-e2e=admin-entries-households] ol li")]
    expect(cells.map((cell) => cell.querySelector(".sr-only")?.textContent)).toEqual([
      "June 2026: 0 entries",
      "July 2026: 1 entry",
      "August 2026: 2 entries",
      "September 2026: 3 entries",
      "October 2026: 4 entries",
      "November 2026: 5 entries",
    ])
    expect(cells[0].textContent).toContain("Jun")
    const link = document.querySelector("[data-e2e=admin-entries-households] a")
    expect(link?.getAttribute("href")).toBe(`/groups/${groupId}`)
    expect(link?.textContent).toBe("Home")
  })

  it("draws no amount, currency or memo, even when the answer carries them", async () => {
    // The server never sends these; a screen that printed whatever it got would show them.
    const leaky = {
      ...overview,
      amount: 987654321,
      memo: "SECRET-MEMO-197",
      topHouseholds: overview.topHouseholds.map((household) => ({
        ...household,
        amount: 987654321,
        currency: "XAU",
        memo: "SECRET-MEMO-197",
      })),
    } as AdminEntriesOverview
    await mount(<AdminEntriesScreen overview={leaky} error={null} onRetry={() => {}} />)

    const html = document.body.innerHTML
    expect(html).toContain("Home")
    expect(html).not.toContain("SECRET-MEMO-197")
    expect(html).not.toContain("987654321")
    expect(html).not.toContain("987,654,321")
    expect(html).not.toContain("XAU")
  })

  it("says the page shows counts only, in a wrapping paragraph under the title", async () => {
    await mount(<AdminEntriesScreen overview={overview} error={null} onRetry={() => {}} />)

    const intro = document.querySelector("[data-e2e=admin-entries-intro]")
    expect(intro?.tagName).toBe("P")
    expect(intro?.textContent).toContain("no amounts or notes")
  })

  it("shows an empty state instead of the lists when no household has an entry", async () => {
    await mount(
      <AdminEntriesScreen
        overview={{
          entries: 0,
          households: 0,
          lastEntryDate: null,
          months: months.map((month) => ({ month, entries: 0, households: 0 })),
          topHouseholds: [],
        }}
        error={null}
        onRetry={() => {}}
      />,
    )

    expect(text("[data-e2e=admin-entries-empty]")).toContain("No entries yet")
    expect(document.querySelector("[data-e2e=admin-entries-months]")).toBe(null)
    expect(document.querySelector("[data-e2e=admin-entries-households]")).toBe(null)
  })

  it("says it is loading until the counts arrive, and offers a retry when they fail", async () => {
    await mount(<AdminEntriesScreen overview={null} error={null} onRetry={() => {}} />)
    expect(document.querySelector("[data-e2e=admin-entries-loading]")).not.toBe(null)

    let retried = 0
    await mount(
      <AdminEntriesScreen overview={null} error="Server error" onRetry={() => retried++} />,
    )
    expect(text("[data-e2e=admin-entries-error]")).toContain("Server error")
    await act(() => {
      ;[...document.querySelectorAll("button")].at(-1)!.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
      )
    })
    expect(retried).toBe(1)
  })
})
