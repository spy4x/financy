/**
 * The budgets page in a browser DOM (happy-dom): who gets which button, the month's notices, the
 * rows and their order, the limit dialog, and that the server's bands and the meter agree.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { usageReading } from "@spy4x/preact-ui/usage-meter"
import {
  BudgetBand,
  budgetBand,
  type BudgetLimit,
  BudgetLimitSource,
  BudgetMethod,
  type BudgetRow,
} from "@domain/budgets"
import { CategoryKind } from "@domain/categories"
import {
  BUDGET_WARN_AT,
  type BudgetActions,
  type BudgetFormView,
  BudgetsScreen,
  type BudgetsScreenProps,
} from "./budgets-screen.tsx"
import type { CategoryRow } from "./category-parts.tsx"

const window = new Window({ url: "http://app.localhost/" })
const own = {
  document: globalThis.document,
  FormData: globalThis.FormData,
  location: globalThis.location,
  getComputedStyle: globalThis.getComputedStyle,
}

beforeAll(() => {
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

async function mount(props: Partial<BudgetsScreenProps> = {}): Promise<void> {
  root = document.createElement("div")
  document.body.append(root)
  await act(() => render(<BudgetsScreen {...defaults} {...props} />, root!))
}

/** An element's text without the marks that isolate a name's direction. */
function text(selector: string): string {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  return (element.textContent ?? "").replace(/[⁨⁩]/g, "")
}

function count(selector: string): number {
  return document.querySelectorAll(selector).length
}

/** The accessible names of the row buttons, in page order. */
function buttons(): string[] {
  return [...document.querySelectorAll("[data-budget-action]")]
    .map((button) => (button.getAttribute("aria-label") ?? "").replace(/[⁨⁩]/g, ""))
}

async function click(selector: string): Promise<void> {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  await act(() => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event,
    )
  })
}

function category(id: string, name: string, parentId: string | null = null): CategoryRow {
  return {
    id,
    name,
    kind: CategoryKind.EXPENSE,
    parentId,
    icon: "tag",
    color: "#2563eb",
    archived: false,
  } as CategoryRow
}

const eur = (amount: number): BudgetLimit => ({ amount, currency: "EUR" })

function row(categoryId: string, limit: BudgetLimit | null, over: Partial<BudgetRow> = {}) {
  return {
    categoryId,
    parentId: null,
    limit,
    source: limit ? BudgetLimitSource.OWN : null,
    spending: 0,
    currency: "EUR",
    band: null,
    percent: null,
    leftOut: [],
    ...over,
  } as BudgetRow
}

const home = { id: "019a0000-0000-7000-8000-000000000001", name: "Home", canWrite: true }
const FOOD = category("food", "Food")
const MARKET = category("market", "Market", "food")
const RENT = category("rent", "Rent")
const CATEGORIES = [RENT, MARKET, FOOD]
/**
 * Food sums its subcategories, Market has its own limit, Rent has none and spent the most, so an
 * order by spending would put it first.
 */
const ROWS = [
  row("food", eur(35_000), { source: BudgetLimitSource.CHILDREN, spending: 41_200 }),
  row("market", eur(35_000), { parentId: "food", spending: 30_000 }),
  row("rent", null, { spending: 90_000 }),
]

const noop = () => {}
const actions: BudgetActions = {
  onEdit: noop,
  onChange: noop,
  onSave: () => Promise.resolve(true),
  onRemove: () => Promise.resolve(true),
  onCancel: noop,
}

const defaults: BudgetsScreenProps = {
  group: home,
  month: "2026-11",
  now: new Date("2026-11-13T12:00:00Z"),
  timeZone: "UTC",
  onMonth: noop,
  budgets: {
    month: "2026-11",
    from: "2026-11-01",
    to: "2026-11-30",
    baseCurrency: "EUR",
    rows: ROWS,
    method: BudgetMethod.LIMITS,
    methodVersion: null,
  },
  categories: CATEGORIES,
  loading: false,
  error: null,
  onRetry: noop,
  savedAt: null,
  plan: { allows: true, canManage: true },
  form: null,
  saving: false,
  actions,
}

const form = (over: Partial<BudgetFormView> = {}): BudgetFormView => ({
  categoryId: "market",
  amount: 35_000,
  currency: "EUR",
  base: eur(35_000),
  conflict: false,
  amountError: null,
  error: null,
  plan: null,
  ...over,
})

describe("the server's band and the budget meter", () => {
  /** The meter state each band may draw; orange is "near" below 100% and "reached" at it. */
  const allowed: Record<BudgetBand, string[]> = {
    [BudgetBand.GREEN]: ["under"],
    [BudgetBand.YELLOW]: ["near"],
    [BudgetBand.ORANGE]: ["near", "reached"],
    [BudgetBand.RED]: ["over"],
  }

  it("agree at every edge: 79, 80, 94, 95, 100 and 100.01 percent, and refunds past spending", () => {
    const limit = 1_000_000
    const cases: [number, string][] = [
      [790_000, "under"],
      [800_000, "near"],
      [940_000, "near"],
      [950_000, "near"],
      [1_000_000, "reached"],
      [1_000_100, "over"],
      [-5_000, "under"],
    ]
    for (const [spending, state] of cases) {
      const { band } = budgetBand(spending, limit)
      const reading = usageReading(spending, limit, BUDGET_WARN_AT)
      expect({ spending, state: reading.state }).toEqual({ spending, state })
      expect({ spending, allowed: allowed[band].includes(reading.state) })
        .toEqual({ spending, allowed: true })
    }
  })
})

describe("BudgetsScreen", () => {
  it("draws parents first with their subcategories under them, never by how full they are", async () => {
    await mount()
    const order = [...document.querySelectorAll("[data-e2e=budgets-list] li")]
      .map((li) => li.getAttribute("data-e2e"))
    expect(order).toEqual(["budget-food", "budget-market", "budget-rent"])
  })

  it("gives an editor a pencil on an own limit, Set limit elsewhere, and none on the sum itself", async () => {
    await mount()
    expect(buttons()).toEqual([
      "Set a limit on Food",
      "Change the limit on Market",
      "Set a limit on Rent",
    ])
    expect(text("[data-e2e=budget-food] [data-e2e=budget-children-sum]"))
      .toBe("Sum of its subcategories' limits")
    expect(text("[data-e2e=budget-rent] [data-e2e=budget-spent]")).toBe("€900.00 spent")
    expect(count("[data-e2e=budget-rent] [role=meter]")).toBe(0)
  })

  it("names what is over the limit in the meter's own words", async () => {
    await mount()
    const meter = document.querySelector("[data-e2e=budget-food] [role=meter]")!
    expect(meter.getAttribute("data-state")).toBe("over")
    expect(meter.getAttribute("aria-valuetext")).toBe(
      "€412.00 of €350.00, €62.00 over the limit",
    )
    expect(text("[data-e2e=budget-food] [role=meter] p")).toBe("€62.00 over the limit")
  })

  it("gives a viewer no buttons and one line that says why", async () => {
    await mount({ group: { ...home, canWrite: false } })
    expect(buttons()).toEqual([])
    expect(text("[data-e2e=budgets-read-only]"))
      .toBe("You can view budgets, but only editors can change them.")
    expect(count("[data-e2e=budgets-plan]")).toBe(0)
  })

  it("without the plan keeps every bar, offers only removing an own limit, and links billing for whoever pays", async () => {
    await mount({ plan: { allows: false, canManage: true } })
    expect(buttons()).toEqual(["Remove the limit on Market"])
    expect(count("[data-e2e=budget-food] [role=meter]")).toBe(1)
    expect(text("[data-e2e=budgets-plan]")).toContain("Setting limits needs the Household plan")
    expect(count("[data-e2e=budgets-plan] a")).toBe(1)
  })

  it("without the plan asks a member who cannot pay to ask the owner, with no billing link", async () => {
    await mount({ plan: { allows: false, canManage: false } })
    expect(text("[data-e2e=budgets-plan]")).toContain("Ask the household's owner")
    expect(count("[data-e2e=budgets-plan] a")).toBe(0)
  })

  it("shows a past month as it was, with no buttons", async () => {
    await mount({ month: "2026-10" })
    expect(buttons()).toEqual([])
    expect(text("[data-e2e=budgets-past]"))
      .toBe("October 2026 is over. Its limits and spending show as they were.")
  })

  it("keeps a future month editable and says it has not started", async () => {
    await mount({ month: "2026-12" })
    expect(buttons()).toHaveLength(3)
    expect(text("[data-e2e=budgets-future]")).toBe("December 2026 hasn't started yet.")
  })

  it("takes the current month from the household's time zone, not the device's", async () => {
    // 23:30 UTC on 31 October is already 1 November in Tokyo.
    await mount({ now: new Date("2026-10-31T23:30:00Z"), timeZone: "Asia/Tokyo" })
    expect(count("[data-e2e=budgets-past]")).toBe(0)
    expect(count("[data-e2e=budgets-future]")).toBe(0)
  })

  it("says the month on screen is the device's saved copy, and offers no buttons", async () => {
    await mount({ savedAt: Date.UTC(2026, 10, 12, 9, 30) })
    expect(buttons()).toEqual([])
    expect(text("[data-e2e=budgets-saved-copy]")).toContain("Saved copy of November 2026")
  })

  it("names each left-out currency once for the month, however many bars carry it", async () => {
    await mount({
      budgets: {
        ...defaults.budgets!,
        rows: ROWS.map((r) => ({ ...r, leftOut: ["USD", "THB"] })),
      },
    })
    expect(count("[data-e2e=budgets-left-out]")).toBe(1)
    expect(text("[data-e2e=budgets-left-out]"))
      .toBe("This month leaves out spending in THB and USD: no exchange rate for them yet.")
  })

  it("says nothing about left-out currencies when every rate was there", async () => {
    await mount()
    expect(count("[data-e2e=budgets-left-out]")).toBe(0)
  })

  it("says a spending too large to show instead of drawing a bar", async () => {
    await mount({
      budgets: { ...defaults.budgets!, rows: [row("rent", eur(1_000), { spending: null })] },
    })
    expect(text("[data-e2e=budget-too-large]")).toBe("The spending is too large to show.")
    expect(count("[role=meter]")).toBe(0)
  })

  it("asks an editor to add an expense category when there is none, and tells a viewer there is none", async () => {
    await mount({ budgets: { ...defaults.budgets!, rows: [] } })
    expect(document.body.textContent).toContain("Add an expense category first")
    expect(count("[data-e2e=budgets-add-category]")).toBe(1)
    await act(() => render(null, root!))
    await mount({
      budgets: { ...defaults.budgets!, rows: [] },
      group: { ...home, canWrite: false },
    })
    expect(document.body.textContent).toContain("No expense categories yet")
    expect(count("[data-e2e=budgets-add-category]")).toBe(0)
  })

  it("puts one line on top when no category has a limit yet", async () => {
    await mount({ budgets: { ...defaults.budgets!, rows: [row("rent", null)] } })
    expect(text("[data-e2e=budgets-no-limits]"))
      .toBe("Set a monthly limit on a category to see how much is left.")
  })

  it("offers Try again when the month could not be loaded", async () => {
    let retried = 0
    await mount({ budgets: null, error: `Budgets.loadError`, onRetry: () => void retried++ })
    expect(text("[data-e2e=budgets-error]")).toContain("The budgets could not be loaded.")
    await click("[data-e2e=budgets-retry]")
    expect(retried).toBe(1)
  })

  it("opens the dialog on the row's category, with Remove limit only for an own limit", async () => {
    const edited: string[] = []
    await mount({ actions: { ...actions, onEdit: (id) => void edited.push(id) } })
    await click("[data-e2e=budget-market] [data-e2e=budget-change]")
    expect(edited).toEqual(["market"])
    await act(() => render(<BudgetsScreen {...defaults} form={form()} />, root!))
    expect(text("[data-e2e=budget-dialog] h2")).toBe("Market limit")
    expect(count("[data-e2e=budget-dialog-remove]")).toBe(1)
    await act(() => render(<BudgetsScreen {...defaults} form={form({ base: null })} />, root!))
    expect(count("[data-e2e=budget-dialog-remove]")).toBe(0)
  })

  it("asks before removing a limit, and removes it only on confirm", async () => {
    let removed = 0
    const remove = { ...actions, onRemove: () => (removed++, Promise.resolve(true)) }
    await mount({ form: form(), actions: remove })
    await click("[data-e2e=budget-dialog-remove]")
    expect(text("[data-e2e=budget-remove-dialog]")).toContain("Remove the limit on Market?")
    expect(removed).toBe(0)
    await click("[data-e2e=budget-remove-confirm]")
    expect(removed).toBe(1)
  })

  it("shows a refused amount under its field, marks the field invalid and focuses it", async () => {
    await mount({ form: form({ amount: null, amountError: `BudgetDialog.amountRequired` }) })
    const input = document.getElementById("budget-amount")!
    const message = document.getElementById("budget-amount-error")!
    expect(message.textContent).toBe("Type a limit.")
    expect(input.closest("[data-e2e=budget-amount]")?.contains(message)).toBe(true)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain("budget-amount-error")
    expect(input.parentElement?.classList.contains("border-danger")).toBe(true)
    expect(document.activeElement?.id).toBe("budget-amount")
    expect(count("[data-e2e=budget-dialog] [role=alert]")).toBe(0)
  })

  it("says someone else changed the limit while the dialog was open", async () => {
    await mount({ form: form({ conflict: true }) })
    expect(text("[data-e2e=budget-conflict]"))
      .toBe("Someone else changed this limit. You now see their change.")
  })
})
