/** The admin Repeating entries screen in a browser DOM (happy-dom): its counts, states and links. */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { FormatContext } from "@spy4x/preact-ui/format"
import { createFormatters } from "@spy4x/time/format"
import type { AdminRecurringOverview } from "@domain/recurring"
import { AdminRecurringScreen } from "./admin-recurring-screen.tsx"

const window = new Window({ url: "http://admin.localhost/recurring" })
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
const overview: AdminRecurringOverview = {
  households: 2,
  rules: 1235,
  paused: 2,
  made: 4321,
  topHouseholds: [
    {
      groupId: home,
      groupName: "Home",
      rules: 1234,
      paused: 0,
      made: 4320,
      lastChangeDate: `2026-11-01`,
    },
    {
      groupId: flat,
      groupName: "Flat",
      rules: 1,
      paused: 1,
      made: 1,
      lastChangeDate: `2026-10-31`,
    },
  ],
}

describe("AdminRecurringScreen", () => {
  it("shows the totals and each household's rules, made entries, paused count and day, linked to its page", async () => {
    await mount(<AdminRecurringScreen overview={overview} error={null} onRetry={() => {}} />)

    const stats = text("[data-e2e=admin-recurring-stats]")
    expect(stats).toContain("Households using them2")
    expect(stats).toContain("Repeating entries1,235")
    expect(stats).toContain("Paused2")
    expect(stats).toContain("Entries made4,321")
    const rows = [...document.querySelectorAll("[data-e2e=admin-recurring-households] li")]
      .map((row) => row.textContent)
    // A household with nothing paused shows no paused badge. A date-only value is a calendar
    // day: it shows as itself in every time zone.
    expect(rows).toEqual([
      "Home1,234 repeating entries · 4,320 entries madeLatest change 1 Nov 2026",
      "Flat1 paused1 repeating entry · 1 entry madeLatest change 31 Oct 2026",
    ])
    const links = [...document.querySelectorAll("[data-e2e=admin-recurring-households] a")]
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/groups/${home}`,
      `/groups/${flat}`,
    ])
  })

  it("draws no amount, currency, memo or schedule, even when the answer carries them", async () => {
    // The server never sends these; a screen that printed whatever it got would show them.
    const leaky = {
      ...overview,
      amount: 987654321,
      topHouseholds: overview.topHouseholds.map((household) => ({
        ...household,
        amount: 987654321,
        currency: "JPY",
        memo: "SECRET-MEMO-363",
        rrule: "FREQ=WEEKLY;BYDAY=TU",
      })),
    } as AdminRecurringOverview
    await mount(<AdminRecurringScreen overview={leaky} error={null} onRetry={() => {}} />)

    const html = document.body.innerHTML
    expect(html).toContain("Home")
    expect(html).not.toContain("SECRET-MEMO-363")
    expect(html).not.toContain("FREQ=")
    expect(html).not.toContain("987654321")
    expect(html).not.toContain("987,654,321")
    expect(html).not.toContain("JPY")
  })

  it("says the page shows counts only, in a wrapping paragraph under the title", async () => {
    await mount(<AdminRecurringScreen overview={overview} error={null} onRetry={() => {}} />)

    expect(text("[data-e2e=admin-recurring-title]")).toBe("Repeating entries")
    const intro = document.querySelector("[data-e2e=admin-recurring-intro]")
    expect(intro?.tagName).toBe("P")
    expect(intro?.textContent).toContain("no amounts, currencies, memos or schedules")
  })

  it("shows an empty state instead of the list when no household has a rule", async () => {
    await mount(
      <AdminRecurringScreen
        overview={{ households: 0, rules: 0, paused: 0, made: 0, topHouseholds: [] }}
        error={null}
        onRetry={() => {}}
      />,
    )

    expect(text("[data-e2e=admin-recurring-empty]")).toContain("No repeating entries yet")
    expect(document.querySelector("[data-e2e=admin-recurring-stats]")).toBe(null)
    expect(document.querySelector("[data-e2e=admin-recurring-households]")).toBe(null)
  })

  it("says it is loading until the counts arrive, and offers a retry when they fail", async () => {
    await mount(<AdminRecurringScreen overview={null} error={null} onRetry={() => {}} />)
    expect(document.querySelector("[data-e2e=admin-recurring-loading]")).not.toBe(null)

    let retried = 0
    await mount(
      <AdminRecurringScreen overview={null} error="Server error" onRetry={() => retried++} />,
    )
    expect(text("[data-e2e=admin-recurring-error]")).toContain("Server error")
    await act(() => {
      ;[...document.querySelectorAll("button")].at(-1)!.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
      )
    })
    expect(retried).toBe(1)
  })
})
