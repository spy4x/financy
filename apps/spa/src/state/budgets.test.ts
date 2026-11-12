import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { RealtimeRequestError } from "@spy4x/realtime"
import {
  BudgetBand,
  type BudgetLimit,
  BudgetLimitSource,
  type BudgetMonth,
  type BudgetRow,
} from "@domain/budgets"
import {
  BUDGET_MESSAGES,
  type BudgetsDependencies,
  type BudgetSetInput,
  createBudgetsStore,
} from "./budgets.ts"

const groupId = "g-1"

function row(categoryId: string, limit: BudgetLimit | null, over: Partial<BudgetRow> = {}) {
  return {
    categoryId,
    parentId: null,
    limit,
    source: limit ? BudgetLimitSource.OWN : null,
    spending: 0,
    currency: limit?.currency ?? "EUR",
    band: limit ? BudgetBand.GREEN : null,
    percent: limit ? 0 : null,
    leftOut: [],
    ...over,
  } as BudgetRow
}

function month(at: string, rows: BudgetRow[]): BudgetMonth {
  return { month: at, from: `${at}-01`, to: `${at}-28`, baseCurrency: "EUR", rows } as BudgetMonth
}

const conflict = (currentVersion: number) =>
  new RealtimeRequestError("conflict", "Changed", { code: "VERSION_CONFLICT", currentVersion })

/**
 * A store over a fake server: `server` holds each month's rows, `set` records every write and
 * answers with the next version unless `refuse` names an error for the next one.
 */
function harness(overrides: Partial<BudgetsDependencies> = {}) {
  const server = new Map<string, BudgetRow[]>([
    ["2026-11", [row("food", { amount: 50_000, currency: "EUR" }), row("rent", null)]],
    ["2026-10", [row("food", { amount: 30_000, currency: "EUR" }), row("rent", null)]],
  ])
  const writes: BudgetSetInput[] = []
  const refusals: Error[] = []
  let version = 1
  const store = createBudgetsStore({
    month: (_group, at) => Promise.resolve(month(at, server.get(at) ?? [])),
    set(input) {
      writes.push(input)
      const refusal = refusals.shift()
      if (refusal) return Promise.reject(refusal)
      return Promise.resolve({ budget: { version: ++version } })
    },
    ...overrides,
  })
  return { store, server, writes, refuse: (error: Error) => refusals.push(error) }
}

describe("budgets store", () => {
  it("opens a household's month and reads another month when stepped to", async () => {
    const { store } = harness()
    await store.open(groupId, "2026-11")
    expect(store.budgets.value?.rows[0].limit?.amount).toBe(50_000)
    await store.open(groupId, "2026-10")
    expect(store.month.value).toBe("2026-10")
    expect(store.budgets.value?.rows[0].limit?.amount).toBe(30_000)
  })

  it("drops the answer of a month that is no longer on screen", async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => release = resolve)
    const { store } = harness({
      month: async (_group, at) => {
        if (at === "2026-10") await held
        return month(at, [row(at, null)])
      },
    })
    const slow = store.open(groupId, "2026-10")
    await store.open(groupId, "2026-11")
    release()
    await slow
    expect(store.budgets.value?.month).toBe("2026-11")
  })

  it("says the month could not be loaded when the read fails", async () => {
    const { store } = harness({
      month: () => Promise.reject(new Error("Down")),
    })
    await store.open(groupId, "2026-11")
    expect(store.budgets.value).toBeNull()
    expect(store.error.value).toBe(BUDGET_MESSAGES.load)
  })

  it("opens the dialog on the category's own limit, else empty in the base currency", async () => {
    const { store } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("food")
    expect(store.form.value).toMatchObject({ amount: 50_000, currency: "EUR", conflict: false })
    store.startEdit("rent")
    expect(store.form.value).toMatchObject({ amount: null, currency: "EUR", base: null })
  })

  it("starts a parent whose limit is its children's sum empty: the sum is not its own", async () => {
    const { store } = harness()
    await store.open(groupId, "2026-11")
    store.budgets.value = month("2026-11", [
      row("food", { amount: 9_000, currency: "EUR" }, { source: BudgetLimitSource.CHILDREN }),
    ])
    store.startEdit("food")
    expect(store.form.value).toMatchObject({ amount: null, base: null })
  })

  it("asks for an amount before sending an empty limit", async () => {
    const { store, writes } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("rent")
    expect(await store.save()).toBe(false)
    expect(store.form.value?.error).toBe(BUDGET_MESSAGES.required)
    expect(writes).toEqual([])
  })

  it("saves a limit from the month on screen, then sends the version it answered next time", async () => {
    const { store, writes } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("rent")
    store.change(120_000)
    expect(await store.save()).toBe(true)
    expect(store.form.value).toBeNull()
    expect(writes[0]).toEqual({
      groupId,
      categoryId: "rent",
      month: "2026-11",
      amount: 120_000,
      currency: "EUR",
      expectedVersion: null,
    })
    store.startEdit("rent")
    store.change(130_000)
    await store.save()
    expect(writes[1].expectedVersion).toBe(2)
  })

  it("removes a limit with no amount and no currency", async () => {
    const { store, writes } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("food")
    expect(await store.remove()).toBe(true)
    expect(writes[0]).toEqual({
      groupId,
      categoryId: "food",
      month: "2026-11",
      amount: null,
      expectedVersion: null,
    })
  })

  it("saves again at the current version when the row moved on but its limit did not", async () => {
    const { store, writes, refuse } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("food")
    store.change(55_000)
    refuse(conflict(7))
    expect(await store.save()).toBe(true)
    expect(writes.map((write) => write.expectedVersion)).toEqual([null, 7])
    expect(store.form.value).toBeNull()
  })

  it("keeps the dialog open on someone else's limit when it changed meanwhile", async () => {
    const { store, server, writes, refuse } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("food")
    store.change(55_000)
    server.set("2026-11", [row("food", { amount: 70_000, currency: "EUR" }), row("rent", null)])
    refuse(conflict(4))
    expect(await store.save()).toBe(false)
    expect(writes).toHaveLength(1)
    expect(store.form.value).toMatchObject({ amount: 70_000, conflict: true, error: null })
    // Saving now sends the version the conflict named.
    await store.save()
    expect(writes[1]).toMatchObject({ amount: 70_000, expectedVersion: 4 })
  })

  it("shows the plan's refusal in the dialog, not a generic error", async () => {
    const plan = {
      code: "PLAN_FEATURE_MISSING",
      entitlement: "budgets",
      limit: null,
      canUpgrade: true,
    }
    const { store, refuse } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("rent")
    store.change(1_000)
    refuse(new RealtimeRequestError("forbidden", "No plan", plan))
    expect(await store.save()).toBe(false)
    expect(store.form.value?.plan).not.toBeNull()
    expect(store.form.value?.error).toBeNull()
  })

  it("says the category is gone when it was archived meanwhile, and reads the month again", async () => {
    const { store, server, refuse } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("rent")
    store.change(1_000)
    server.set("2026-11", [row("food", { amount: 50_000, currency: "EUR" })])
    refuse(new RealtimeRequestError("conflict", "Archived", { code: "CATEGORY_ARCHIVED" }))
    expect(await store.save()).toBe(false)
    expect(store.form.value?.error).toBe(BUDGET_MESSAGES.gone)
    expect(store.budgets.value?.rows).toHaveLength(1)
  })

  it("tells a failed save from a failed removal", async () => {
    const { store, refuse } = harness()
    await store.open(groupId, "2026-11")
    store.startEdit("food")
    refuse(new Error("Down"))
    await store.save()
    expect(store.form.value?.error).toBe(BUDGET_MESSAGES.save)
    refuse(new Error("Down"))
    await store.remove()
    expect(store.form.value?.error).toBe(BUDGET_MESSAGES.remove)
  })
})
