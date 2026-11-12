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
import type { LocalReads } from "../modules.ts"
import { memoryReads } from "./memory-reads.ts"

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
function harness(overrides: Partial<BudgetsDependencies> = {}, device?: LocalReads) {
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
  }, device)
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

  it("drops an older read of the same month that answers after a newer one", async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => release = resolve)
    let calls = 0
    const { store } = harness({
      month: async (_group, at) => {
        const first = ++calls === 1
        if (first) await held
        return month(at, [row("food", { amount: first ? 10_000 : 20_000, currency: "EUR" })])
      },
    })
    const slow = store.open(groupId, "2026-11")
    await store.refresh()
    release()
    await slow
    expect(store.budgets.value?.rows[0].limit?.amount).toBe(20_000)
    expect(store.loading.value).toBe(false)
  })

  it("keeps the device's copy of each month apart: one month's copy never shows under another", async () => {
    const device = memoryReads(() => 1_000)
    const online = harness({}, device)
    await online.store.open(groupId, "2026-11")
    const offline = harness({ month: () => Promise.reject(new TypeError("offline")) }, device)
    await offline.store.open(groupId, "2026-10")
    expect(offline.store.budgets.value).toBeNull()
    await offline.store.open(groupId, "2026-11")
    expect(offline.store.budgets.value?.rows[0].limit?.amount).toBe(50_000)
    expect(offline.store.savedAt.value).toBe(1_000)
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
    expect(store.form.value).toMatchObject({ amountError: BUDGET_MESSAGES.required, error: null })
    expect(writes).toEqual([])
    store.change(1_000)
    expect(store.form.value?.amountError).toBeNull()
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

  it("sends nothing more when the read after a conflict fails, and a retry is refused again", async () => {
    let reads = 0
    const { store, writes, refuse } = harness({
      month: (_group, at) =>
        ++reads === 1
          ? Promise.resolve(month(at, [row("food", { amount: 50_000, currency: "EUR" })]))
          : Promise.reject(new TypeError("network")),
    })
    await store.open(groupId, "2026-11")
    store.startEdit("food")
    store.change(55_000)
    refuse(conflict(3))
    expect(await store.save()).toBe(false)
    expect(writes.map((write) => [write.amount, write.expectedVersion])).toEqual([[55_000, null]])
    expect(store.form.value).toMatchObject({ amount: 55_000, error: BUDGET_MESSAGES.save })
    // The version the conflict named was not taken on an unread limit.
    refuse(conflict(3))
    await store.save()
    expect(writes.map((write) => write.expectedVersion)).toEqual([null, null])
  })

  it("sends nothing more when the read after a conflict comes from the device's copy", async () => {
    const device = memoryReads()
    let reads = 0
    const { store, writes, refuse } = harness({
      month: (_group, at) =>
        ++reads === 1
          ? Promise.resolve(month(at, [row("food", { amount: 50_000, currency: "EUR" })]))
          : Promise.reject(new TypeError("network")),
    }, device)
    await store.open(groupId, "2026-11")
    store.startEdit("food")
    store.change(55_000)
    refuse(conflict(3))
    expect(await store.save()).toBe(false)
    expect(store.savedAt.value).not.toBeNull()
    expect(writes).toHaveLength(1)
    expect(store.form.value).toMatchObject({ amount: 55_000, error: BUDGET_MESSAGES.save })
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
