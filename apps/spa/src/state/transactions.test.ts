import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { ConnectionLostError, RealtimeRequestError } from "@spy4x/realtime"
import { CategoryKind } from "@domain/categories"
import { TransactionKind } from "@domain/transactions"
import {
  createTransactionsStore,
  prefillEntry,
  TRANSACTION_MESSAGES,
  type TransactionItem,
  type TransactionsDependencies,
} from "./transactions.ts"

const groupId = "g-1"
const ACCOUNTS = new Map([["a-usd", "USD"], ["a-eur", "EUR"]])
const CATEGORIES = new Map([
  ["c-food", CategoryKind.EXPENSE],
  ["c-salary", CategoryKind.INCOME],
])

function entry(id: string, overrides: Partial<TransactionItem> = {}): TransactionItem {
  return {
    id,
    groupId,
    accountId: "a-usd",
    categoryId: "c-food",
    kind: TransactionKind.EXPENSE,
    accountAmount: -1200,
    amount: -1200,
    currency: "USD",
    converted: false,
    memo: "",
    date: "2026-11-10",
    version: 1,
    changeSequence: "1",
    createdByUserId: 1,
    updatedByUserId: 1,
    createdAt: "2026-11-10T08:00:00.000Z",
    updatedAt: "2026-11-10T08:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function refused(code: string, details: Record<string, unknown> = {}) {
  return new RealtimeRequestError("conflict", "refused", { code, ...details })
}

/** A store over a server the test plays; `calls` records each write's input. */
function harness(overrides: Partial<TransactionsDependencies> = {}, list = [entry("t-1")]) {
  const calls: { name: string; input: object }[] = []
  let ids = 0
  const dependencies: TransactionsDependencies = {
    fetchList: () => Promise.resolve(list),
    fetchDeleted: () => Promise.resolve([]),
    create(input) {
      calls.push({ name: "create", input })
      return Promise.resolve({ transaction: entry(input.id, { memo: input.memo }) })
    },
    update(input) {
      calls.push({ name: "update", input })
      return Promise.resolve({ transaction: entry(input.id, { version: input.version + 1 }) })
    },
    delete(input) {
      calls.push({ name: "delete", input })
      return Promise.resolve()
    },
    restore: (input) => Promise.resolve({ transaction: entry(input.id, { version: 3 }) }),
    newId: () => `new-${++ids}`,
    ...overrides,
  }
  const store = createTransactionsStore(dependencies, {
    accountCurrency: (id) => ACCOUNTS.get(id),
    categoryKind: (id) => CATEGORIES.get(id),
  })
  return { store, calls }
}

const blank = {
  kind: TransactionKind.EXPENSE,
  amount: null,
  currency: "USD",
  accountAmount: null,
  accountId: "a-usd",
  categoryId: "c-food",
  date: "2026-11-12",
  memo: "",
}

async function newEntry(overrides: Partial<TransactionsDependencies> = {}) {
  const harnessed = harness(overrides)
  await harnessed.store.open(groupId)
  harnessed.store.startCreate(blank)
  harnessed.store.change({ amount: 450 })
  return harnessed
}

const accounts = [
  { id: "a-eur", currency: "EUR", isDefault: false, archivedAt: null },
  { id: "a-usd", currency: "USD", isDefault: true, archivedAt: null },
]

describe("prefillEntry", () => {
  it("takes kind, account, currency, category and date from the person's last entry", () => {
    const value = prefillEntry({
      accounts,
      userId: 1,
      today: "2026-11-13",
      transactions: [
        entry("old", { createdAt: "2026-11-01T00:00:00.000Z", categoryId: "c-old" }),
        entry("last", {
          createdAt: "2026-11-11T00:00:00.000Z",
          accountId: "a-eur",
          currency: "JPY",
          categoryId: "c-salary",
          kind: TransactionKind.INCOME,
          date: "2026-11-09",
          memo: "kept out",
        }),
        entry("theirs", { createdAt: "2026-11-12T00:00:00.000Z", createdByUserId: 2 }),
      ],
    })

    expect(value).toEqual({
      kind: TransactionKind.INCOME,
      amount: null,
      currency: "JPY",
      accountAmount: null,
      accountId: "a-eur",
      categoryId: "c-salary",
      date: "2026-11-09",
      memo: "",
    })
  })

  it("starts from the default account, its currency, today, Expense and no category without one", () => {
    const value = prefillEntry({ accounts, userId: 1, today: "2026-11-13", transactions: [] })

    expect(value).toEqual({
      kind: TransactionKind.EXPENSE,
      amount: null,
      currency: "USD",
      accountAmount: null,
      accountId: "a-usd",
      categoryId: null,
      date: "2026-11-13",
      memo: "",
    })
  })

  it("starts from the default account when the last entry's account is archived", () => {
    const value = prefillEntry({
      accounts: [{ ...accounts[0], archivedAt: "2026-11-12T00:00:00.000Z" }, accounts[1]],
      userId: 1,
      today: "2026-11-13",
      transactions: [entry("last", { accountId: "a-eur", currency: "EUR" })],
    })

    expect([value.accountId, value.currency, value.categoryId]).toEqual(["a-usd", "USD", null])
  })
})

describe("the transaction editor", () => {
  it("clears an income category when the kind switches to Expense", async () => {
    const { store } = await newEntry()
    store.change({ kind: TransactionKind.INCOME, categoryId: "c-salary" })

    store.change({ kind: TransactionKind.EXPENSE })

    expect(store.form.value?.categoryId).toBe(null)
  })

  it("keeps an expense category when the kind switches to Income: the entry is a refund", async () => {
    const { store } = await newEntry()

    store.change({ kind: TransactionKind.INCOME })

    expect(store.form.value?.categoryId).toBe("c-food")
  })

  it("sends no account amount in the account's own currency", async () => {
    const { store, calls } = await newEntry()
    store.change({ accountAmount: 999 })

    await store.save()

    expect(calls[0].input).not.toHaveProperty("accountAmount")
    expect(calls[0].input).toMatchObject({ amount: 450, currency: "USD", accountCurrency: "USD" })
  })

  it("sends a stated account amount for another currency, and none to let the server convert", async () => {
    const { store, calls } = await newEntry()
    store.change({ currency: "EUR" })
    await store.save()
    store.startCreate(blank)
    store.change({ amount: 450, currency: "EUR", accountAmount: 488 })

    await store.save()

    expect(calls.map((call) => (call.input as { accountAmount?: number }).accountAmount))
      .toEqual([undefined, 488])
  })

  it("asks for the account amount when the server has no rate for the date", async () => {
    const { store, calls } = await newEntry({
      create: () => Promise.reject(refused("NO_RATE")),
    })
    store.change({ currency: "EUR" })

    await store.save()
    expect(store.formErrors.value.noRate).toBe(true)
    expect(store.formErrors.value.accountAmount).not.toBe(null)

    expect(await store.save()).toBe(null)
    expect(calls).toEqual([])
    store.change({ date: "2026-11-11" })
    expect(store.formErrors.value.noRate).toBe(false)
  })

  it("refuses to send without an amount or a category, or with a memo too long", async () => {
    const { store, calls } = harness()
    await store.open(groupId)
    store.startCreate({ ...blank, categoryId: null, memo: "x".repeat(501) })

    expect(await store.save()).toBe(null)

    expect(store.formErrors.value).toMatchObject({
      amount: TRANSACTION_MESSAGES.amountRequired,
      category: TRANSACTION_MESSAGES.categoryRequired,
      memo: { key: `TransactionMessages.memoTooLong`, values: { max: 500, count: 501 } },
    })
    expect(calls).toEqual([])
  })

  it("refuses a memo with a hidden character", async () => {
    const { store } = await newEntry()
    store.change({ memo: "Coffee‮" })

    await store.save()

    expect(store.formErrors.value.memo).toBe(TRANSACTION_MESSAGES.memoUnsafe)
  })

  for (
    const [code, field, message] of [
      ["ACCOUNT_NOT_FOUND", "account", TRANSACTION_MESSAGES.accountGone],
      ["CATEGORY_NOT_FOUND", "category", TRANSACTION_MESSAGES.categoryGone],
      ["CATEGORY_KIND_MISMATCH", "category", TRANSACTION_MESSAGES.categoryKind],
      ["ROLE_INSUFFICIENT", "form", TRANSACTION_MESSAGES.role],
      ["ID_ALREADY_EXISTS", "form", TRANSACTION_MESSAGES.create],
    ] as const
  ) {
    it(`shows ${code} under the ${field} and keeps what was typed`, async () => {
      const { store } = await newEntry({ create: () => Promise.reject(refused(code)) })

      await store.save()

      expect(store.formErrors.value[field]).toBe(message)
      expect(store.form.value?.amount).toBe(450)
    })
  }

  it("sends a new id after the server says the draft's id is taken", async () => {
    let fail = true
    const ids: string[] = []
    const { store } = await newEntry({
      create(input) {
        ids.push(input.id)
        if (fail) return (fail = false, Promise.reject(refused("ID_ALREADY_EXISTS")))
        return Promise.resolve({ transaction: entry(input.id) })
      },
    })

    await store.save()
    await store.save()

    expect(ids).toEqual(["new-1", "new-2"])
  })

  it("shows the plan's refusal and keeps what was typed", async () => {
    const plan = {
      code: "PLAN_LIMIT_REACHED",
      entitlement: "maxTransactions",
      limit: 500,
      canUpgrade: true,
    }
    const { store } = await newEntry({
      create: () => Promise.reject(new RealtimeRequestError("forbidden", "No plan", plan)),
    })

    await store.save()

    expect(store.formErrors.value.plan).toEqual(plan)
    expect(store.form.value?.amount).toBe(450)
  })

  it("shows the entry as it is now after another member changed it", async () => {
    const { store } = harness(
      { update: () => Promise.reject(refused("VERSION_CONFLICT")) },
      [entry("t-1", { memo: "Theirs", version: 2 })],
    )
    await store.open(groupId)
    store.startEdit("t-1")
    store.change({ memo: "Mine" })

    await store.save()

    expect(store.form.value).toMatchObject({ memo: "Theirs", version: 2 })
    expect(store.formErrors.value.form).toBe(TRANSACTION_MESSAGES.conflict)
  })

  it("closes the editor of an entry another member deleted", async () => {
    let rows = [entry("t-1")]
    const { store } = harness({
      fetchList: () => Promise.resolve(rows),
      update: () => Promise.reject(refused("TRANSACTION_NOT_FOUND")),
    })
    await store.open(groupId)
    store.startEdit("t-1")
    store.change({ memo: "Mine" })
    rows = []

    await store.save()

    expect(store.form.value).toBe(null)
    expect(store.formErrors.value.form).toBe(TRANSACTION_MESSAGES.gone)
  })

  it("opens a converted entry with the account amount empty, so an unchanged save keeps it", async () => {
    const { store, calls } = harness({}, [
      entry("t-1", { currency: "EUR", amount: -450, accountAmount: -488, converted: true }),
    ])
    await store.open(groupId)
    store.startEdit("t-1")

    expect(store.form.value?.accountAmount).toBe(null)
    expect(store.unsaved.value).toBe(false)
    await store.save()
    expect(calls[0].input).not.toHaveProperty("accountAmount")
  })

  it("opens an entry with the person's own rate with that account amount", async () => {
    const { store } = harness({}, [
      entry("t-1", { currency: "EUR", amount: -450, accountAmount: -500, converted: false }),
    ])
    await store.open(groupId)

    store.startEdit("t-1")

    expect(store.form.value?.accountAmount).toBe(500)
  })
})

describe("deleting an entry", () => {
  it("takes it off the list and offers Undo, which brings it back", async () => {
    const { store } = harness()
    await store.open(groupId)

    expect(await store.remove("t-1")).toBe(true)
    expect(store.transactions.value).toEqual([])
    expect(store.undo.value?.id).toBe("t-1")

    expect(await store.undoDelete()).toBe(true)
    expect(store.transactions.value.map((row) => row.id)).toEqual(["t-1"])
    expect(store.undo.value).toBe(null)
  })

  it("keeps an entry another member changed, says so, and reads the list again", async () => {
    let reads = 0
    const { store } = harness({
      fetchList: () => (reads++, Promise.resolve([entry("t-1", { version: 2 })])),
      delete: () => Promise.reject(refused("VERSION_CONFLICT")),
    })
    await store.open(groupId)

    expect(await store.remove("t-1")).toBe(false)

    expect(store.listError.value).toBe(TRANSACTION_MESSAGES.conflict)
    expect(store.undo.value).toBe(null)
    expect(reads).toBe(2)
    expect(store.transactions.value.map((row) => row.version)).toEqual([2])
  })

  it("says a restore needs the server when it cannot be reached", async () => {
    const { store } = harness({
      restore: () => Promise.reject(new ConnectionLostError("offline")),
    })
    await store.open(groupId)

    expect(await store.restore("t-1")).toBe(null)

    expect(store.listError.value).toBe(TRANSACTION_MESSAGES.restoreOffline)
  })

  it("says an entry is no longer among the deleted ones when the server has purged it", async () => {
    const { store } = harness({
      restore: () => Promise.reject(refused("TRANSACTION_NOT_FOUND")),
    })
    await store.open(groupId)

    await store.restore("t-1")

    expect(store.listError.value).toBe(TRANSACTION_MESSAGES.restoreGone)
  })
})
