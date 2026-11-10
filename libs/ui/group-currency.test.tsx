/**
 * The group's main currency, driven in a browser DOM (happy-dom): who gets "Change", what offline
 * does, and the dialog's focus, choice, clash, refusal and no-rate marks.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import { I18nContext } from "@spy4x/preact-ui/i18n"
import uiEn from "@spy4x/preact-ui/i18n/en"
import appEn from "@i18n/app/en.ts"
import type { HouseholdSettingsView } from "@domain/money"
import { GroupCurrencySection, type GroupCurrencySectionProps } from "./group-currency.tsx"

const window = new Window({ url: "http://app.localhost/groups/x/settings" })
const own = {
  document: globalThis.document,
  FormData: globalThis.FormData,
  location: globalThis.location,
  getComputedStyle: globalThis.getComputedStyle,
}

beforeAll(() => {
  // EnhancedForm reads a form with the DOM's own FormData; a dialog reads the page's style to
  // lock its scroll.
  Object.assign(globalThis, {
    document: window.document,
    FormData: window.FormData,
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

const VIEW: HouseholdSettingsView = {
  settings: {
    groupId: "019a5b0e-1af5-7f04-8ae4-b1ee5d111001",
    baseCurrency: "EUR",
    version: 2,
    chosen: true,
    updatedAt: new Date("2026-11-06T16:02:00.000Z"),
  },
  rates: [],
  ratedCurrencies: ["EUR", "USD"],
}

/** The app's English, with the components' words, as the SPA builds it. */
const ENGLISH = createTranslator({
  language: "en",
  catalogs: [{ source: uiEn }, { source: appEn }],
})

interface Calls {
  opened: number
  closed: number
  saved: string[]
}

/** Draws the section with `props` over an admin's defaults, and records its callbacks. */
async function draw(props: Partial<GroupCurrencySectionProps> = {}, calls?: Calls) {
  const record = calls ?? { opened: 0, closed: 0, saved: [] }
  if (!root) {
    root = document.createElement("div")
    document.body.append(root)
  }
  await act(() =>
    render(
      <I18nContext.Provider value={ENGLISH}>
        <GroupCurrencySection
          view={VIEW}
          canChange
          offline={false}
          dialogOpen={false}
          onOpen={() => void record.opened++}
          onClose={() => void record.closed++}
          onSave={(code) => void record.saved.push(code)}
          saving={false}
          error={null}
          changedElsewhere={null}
          {...props}
        />
      </I18nContext.Provider>,
      root!,
    )
  )
  return record
}

function find<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  return element as unknown as T
}

const has = (selector: string) => document.querySelector(selector) !== null

describe("GroupCurrencySection", () => {
  it("gives an admin or the owner Change, which opens the dialog", async () => {
    const calls = await draw()
    expect(find("[data-e2e=group-currency-value]").textContent).toBe("Euro (EUR)")
    const change = find<HTMLButtonElement>("[data-e2e=group-currency-change]")
    expect(change.disabled).toBe(false)
    expect(change.textContent).toBe("Change main currency")
    expect(has("[data-e2e=group-currency-read-only]")).toBe(false)
    await act(() => change.click())
    expect(calls.opened).toBe(1)
  })

  it("shows an editor or viewer the currency and who may change it, with no button at all", async () => {
    await draw({ canChange: false })
    expect(find("[data-e2e=group-currency-value]").textContent).toBe("Euro (EUR)")
    expect(has("[data-e2e=group-currency-change]")).toBe(false)
    expect(find("[data-e2e=group-currency-read-only]").textContent).toContain("admin")
  })

  it("draws no dialog for an editor or viewer, even when the dialog is asked open", async () => {
    await draw({ canChange: false, dialogOpen: true })
    expect(has("[data-e2e=group-currency-field]")).toBe(false)
    expect(has("dialog")).toBe(false)
  })

  it("disables Change offline and says why, linked to the button", async () => {
    await draw({ offline: true })
    const change = find<HTMLButtonElement>("[data-e2e=group-currency-change]")
    expect(change.disabled).toBe(true)
    expect(change.getAttribute("aria-describedby")).toBe("group-currency-offline")
    expect(find("#group-currency-offline").textContent).not.toBe("")
  })

  it("says why the currency could not be read", async () => {
    await draw({ view: null, loadError: "Couldn't load the main currency." })
    expect(find("[data-e2e=group-currency-load-error]").textContent).toContain(
      "Couldn't load the main currency.",
    )
    expect(find<HTMLButtonElement>("[data-e2e=group-currency-change]").disabled).toBe(true)
  })

  it("opens the dialog with the field focused and the saved currency chosen", async () => {
    await draw({ dialogOpen: true })
    const input = find<HTMLInputElement>("[data-e2e=group-currency-field] input")
    // Compared as a flag: a diff of two DOM nodes runs out of memory.
    expect(document.activeElement === input).toBe(true)
    // Focus opens the list, with the saved currency as its selected row.
    expect(find("[role=option][aria-selected=true]").textContent).toMatch(/^EUR/)
    expect(find("[data-e2e=group-currency-use]").textContent).toBe("Use \u2068Euro\u2069")
  })

  it("saves the chosen currency on Use", async () => {
    const calls = await draw({ dialogOpen: true })
    const form = find("[data-e2e=group-currency-use]").closest("form")!
    await act(async () => {
      form.dispatchEvent(
        new window.SubmitEvent("submit", { bubbles: true, cancelable: true }) as unknown as Event,
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(calls.saved).toEqual(["EUR"])
  })

  it("marks a currency with no daily rate on this server in the list, and not a rated one", async () => {
    await draw({ dialogOpen: true })
    const input = find<HTMLInputElement>("[data-e2e=group-currency-field] input")
    input.value = "ARS"
    await act(() => {
      input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event)
    })
    const rows = [...document.querySelectorAll("[role=option]")].map((row) => row.textContent)
    expect(rows.find((row) => row?.includes("ARS"))).toContain("No daily rate here")
    input.value = "USD"
    await act(() => {
      input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event)
    })
    const usd = [...document.querySelectorAll("[role=option]")]
      .map((row) => row.textContent).find((row) => row?.startsWith("USD"))
    expect(usd).toBeDefined()
    expect(usd).not.toContain("No daily rate here")
  })

  it("names the currency another member saved while the dialog was open", async () => {
    await draw({ dialogOpen: true, changedElsewhere: "GBP" })
    expect(find("[data-e2e=group-currency-elsewhere]").textContent).toContain("GBP")
  })

  it("shows a refused save in the dialog", async () => {
    await draw({ dialogOpen: true, error: "Your role in this group doesn't allow this." })
    expect(find("[data-e2e=group-currency-error]").textContent).toContain(
      "Your role in this group doesn't allow this.",
    )
  })

  it("hands focus back to Change when the dialog closes", async () => {
    const calls = await draw({ dialogOpen: true })
    await draw({ dialogOpen: false }, calls)
    expect(document.activeElement?.getAttribute("data-e2e")).toBe("group-currency-change")
  })
})
