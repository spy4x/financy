/**
 * The Exchange rates screen, driven in a browser DOM (happy-dom): loading, a failed read, no fetch
 * yet, the three facts with the fallback off, in use or capped, and the last 7 days.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import type { AdminRatesSnapshot } from "@domain/money"
import { AdminRatesScreen, type AdminRatesScreenProps } from "./admin-rates-screen.tsx"

const window = new Window({ url: "http://admin.localhost/rates" })
const own = {
  document: globalThis.document,
  location: globalThis.location,
  getComputedStyle: globalThis.getComputedStyle,
}

beforeAll(() => {
  Object.assign(globalThis, {
    document: window.document,
    // A link hands a click to `navigate` only for an address of the page's own origin.
    location: window.location,
    getComputedStyle: window.getComputedStyle.bind(window),
  })
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

/** Fri 6 Nov to Thu 12 Nov 2026, newest first: the weekend has no rows. */
const SNAPSHOT: AdminRatesSnapshot = {
  lastRun: { at: "2026-11-12T16:02:00.000Z", failed: false },
  fetches: [{ source: "frankfurter:ECB", fetchedAt: "2026-11-12T16:02:00.000Z", count: 30 }],
  missing: { date: "2026-11-12", currencies: ["ARS", "NGN"] },
  fallback: { used: 12, cap: 1000, resetsOn: "2026-12-01" },
  days: [
    "2026-11-12",
    "2026-11-11",
    "2026-11-10",
    "2026-11-09",
    "2026-11-08",
    "2026-11-07",
    "2026-11-06",
  ].map((date) => ({
    date,
    rows: date === "2026-11-08" || date === "2026-11-07"
      ? []
      : [{ source: "frankfurter:ECB", currencies: 30, fetchedAt: `${date}T16:02:00.000Z` }],
  })),
}

async function draw(props: Partial<AdminRatesScreenProps> = {}): Promise<{ retries: number }> {
  const calls = { retries: 0 }
  if (!root) {
    root = document.createElement("div")
    document.body.append(root)
  }
  await act(() =>
    render(
      <AdminRatesScreen
        snapshot={SNAPSHOT}
        error={null}
        pending={false}
        onRetry={() => void calls.retries++}
        {...props}
      />,
      root!,
    )
  )
  return calls
}

function find<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  return element as unknown as T
}

const has = (selector: string) => document.querySelector(selector) !== null
const text = (selector: string) => find(selector).textContent ?? ""

describe("AdminRatesScreen", () => {
  it("shows a loading skeleton before the first reading", async () => {
    await draw({ snapshot: null, pending: true })
    expect(find("[data-e2e=admin-rates-loading]").getAttribute("role")).toBe("status")
    expect(has("[data-e2e=admin-rates-facts]")).toBe(false)
  })

  it("says why the first reading failed, with Try again", async () => {
    const calls = await draw({ snapshot: null, error: "Couldn't load the rates." })
    expect(text("[data-e2e=admin-rates-error]")).toContain("Couldn't load the rates.")
    expect(has("[data-e2e=admin-rates-loading]")).toBe(false)
    const retry = [...document.querySelectorAll("button")].find((b) =>
      b.textContent === "Try again"
    )!
    await act(() => retry.click())
    expect(calls.retries).toBe(1)
  })

  it("says no rates were fetched yet, with no facts or table", async () => {
    await draw({
      snapshot: { ...SNAPSHOT, lastRun: null, fetches: [], days: [] },
    })
    expect(document.body.textContent).toContain("No rates yet")
    expect(has("[data-e2e=admin-rates-facts]")).toBe(false)
    expect(has("[data-e2e=admin-rates-days]")).toBe(false)
  })

  it("shows the last fetch, the currencies with no rate and the fallback's calls this month", async () => {
    await draw()
    expect(text("[data-e2e=admin-rates-last-fetch]")).toContain("ECB, through Frankfurter")
    expect(text("[data-e2e=admin-rates-last-fetch]")).toContain("30")
    expect(text("[data-e2e=admin-rates-missing]")).toContain("ARS, NGN")
    const meter = find("[data-e2e=admin-rates-fallback] [role=meter]")
    expect(meter.getAttribute("aria-valuenow")).toBe("12")
    expect(meter.getAttribute("aria-valuemax")).toBe("1000")
    expect(meter.textContent).toContain("Calls this month")
    expect(meter.textContent).toContain("12 of 1,000")
    expect(text("[data-e2e=admin-rates-fallback]")).not.toContain("cap is reached")
  })

  it("says every currency in use has a rate when none is missing", async () => {
    await draw({ snapshot: { ...SNAPSHOT, missing: { date: "2026-11-12", currencies: [] } } })
    expect(text("[data-e2e=admin-rates-missing]")).toContain("Every currency in use has a rate")
  })

  it("says the fallback is off, with no meter, when no key is set", async () => {
    await draw({ snapshot: { ...SNAPSHOT, fallback: null } })
    expect(text("[data-e2e=admin-rates-fallback]")).toContain("Fallback is off")
    expect(has("[data-e2e=admin-rates-fallback] [role=meter]")).toBe(false)
  })

  it("warns that the fallback stopped once its monthly cap is reached", async () => {
    await draw({
      snapshot: { ...SNAPSHOT, fallback: { used: 1000, cap: 1000, resetsOn: "2026-12-01" } },
    })
    expect(text("[data-e2e=admin-rates-fallback]")).toContain("The monthly cap is reached")
    expect(text("[data-e2e=admin-rates-fallback]")).toContain("December")
  })

  it("lists the last 7 days, with the weekend's days muted and saying why they have no rates", async () => {
    await draw()
    const rows = [...document.querySelectorAll("[data-e2e=admin-rates-days] tbody tr")]
    expect(rows.length).toBe(7)
    const weekend = rows.filter((row) => row.querySelector("[data-weekend]"))
    expect(weekend.length).toBe(2)
    for (const row of weekend) {
      expect(row.textContent).toContain("No ECB rates on weekends")
    }
    expect(rows[0].textContent).toContain("Thu")
  })

  it("shows a weekday with no rows as missing, in the warning style, not as a weekend", async () => {
    await draw({
      snapshot: {
        ...SNAPSHOT,
        days: SNAPSHOT.days.map((day) => day.date === "2026-11-10" ? { ...day, rows: [] } : day),
      },
    })
    const rows = [...document.querySelectorAll("[data-e2e=admin-rates-days] tbody tr")]
    const tuesday = rows.find((row) => row.textContent?.includes("Tuesday"))!
    expect(tuesday.querySelector("[data-weekend]")).toBe(null)
    expect(tuesday.querySelector("[data-missing]")).not.toBe(null)
    expect(tuesday.textContent).toContain("No rates fetched")
    expect(tuesday.textContent).not.toContain("weekend")
    expect(tuesday.querySelector(".text-warning")).not.toBe(null)
    expect(rows.filter((row) => row.querySelector("[data-weekend]")).length).toBe(2)
  })

  it("shows a Saturday with no rows as a weekend, not as missing", async () => {
    await draw()
    const rows = [...document.querySelectorAll("[data-e2e=admin-rates-days] tbody tr")]
    const saturday = rows.find((row) => row.textContent?.includes("Saturday"))!
    expect(saturday.querySelector("[data-weekend]")).not.toBe(null)
    expect(saturday.querySelector("[data-missing]")).toBe(null)
    expect(saturday.querySelector(".text-warning")).toBe(null)
    expect(has("[data-missing]")).toBe(false)
  })

  it("shows no danger notice after a run that worked", async () => {
    await draw()
    expect(has("[data-e2e=admin-rates-failed]")).toBe(false)
  })

  it("says when the last run failed, with a link to the failed jobs", async () => {
    await draw({
      snapshot: { ...SNAPSHOT, lastRun: { at: "2026-11-12T16:02:00.000Z", failed: true } },
    })
    expect(text("[data-e2e=admin-rates-failed]")).toContain("The last fetch failed at")
    const link = find<HTMLAnchorElement>("[data-e2e=admin-rates-failed] a")
    expect(link.getAttribute("href")).toBe("/jobs?state=failed")
    expect(link.textContent).toBe("Open Jobs")
    expect(link.classList.contains("min-h-11")).toBe(true)
  })

  it("links Open Jobs in the header to the Jobs page as a text link", async () => {
    await draw()
    const link = find<HTMLAnchorElement>("a[data-e2e=admin-rates-jobs]")
    expect(link.getAttribute("href")).toBe("/jobs")
    expect(link.textContent).toBe("Open Jobs")
    expect(link.classList.contains("pc-link")).toBe(true)
    expect(link.classList.contains("min-h-11")).toBe(true)
  })

  it("keeps the last reading on screen when a later read fails, and says so", async () => {
    await draw({ error: "Couldn't load the rates." })
    expect(text("[data-e2e=admin-rates-error]")).toContain("Couldn't load the rates.")
    expect(has("[data-e2e=admin-rates-facts]")).toBe(true)
  })
})
