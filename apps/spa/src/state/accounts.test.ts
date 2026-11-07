import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { RealtimeRequestError } from "@spy4x/realtime"
import { ACCOUNT_MAX_PER_GROUP, AccountKind } from "@domain/accounts"
import {
  ACCOUNT_MESSAGES,
  type AccountItem,
  type AccountsDependencies,
  createAccountsStore,
} from "./accounts.ts"

const groupId = "g-1"

function item(id: string, over: Partial<AccountItem> = {}): AccountItem {
  return {
    id,
    groupId,
    name: id,
    kind: AccountKind.BANK,
    currency: "USD",
    startingBalance: 0,
    balance: 0,
    archivedAt: null,
    isDefault: false,
    version: 1,
    changeSequence: "1",
    createdAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
    deletedAt: null,
    ...over,
  }
}

function refused(code: string) {
  return new RealtimeRequestError("conflict", "Refused", { code })
}

/** A store over fake calls that records each one; `live` and `trash` are what the server holds. */
function harness(overrides: Partial<AccountsDependencies> = {}) {
  const calls: { name: string; input: unknown }[] = []
  let live = [item("a", { name: "Cash", balance: 700, startingBalance: 500 }), item("b")]
  let trash: AccountItem[] = []
  /** The write's answer: the account as saved, with no balance, as the server sends it. */
  const saved = (account: AccountItem) => ({ account: { ...account, balance: undefined } })
  const store = createAccountsStore({
    fetchList: (_, deleted) => Promise.resolve(deleted ? trash : live),
    create(input) {
      calls.push({ name: "create", input })
      return Promise.resolve(saved(item(input.id, input)))
    },
    update(input) {
      calls.push({ name: "update", input })
      return Promise.resolve(saved(item(input.id, { ...input, version: input.version + 1 })))
    },
    archive(input) {
      calls.push({ name: "archive", input })
      return Promise.resolve(saved(item(input.id, { archivedAt: "2026-11-06T01:00:00.000Z" })))
    },
    setDefault(input) {
      calls.push({ name: "setDefault", input })
      live = live.map((account) => ({ ...account, isDefault: account.id === input.id }))
      return Promise.resolve(saved(live.find((account) => account.id === input.id)!))
    },
    delete(input) {
      calls.push({ name: "delete", input })
      const gone = live.find((account) => account.id === input.id)!
      live = live.filter((account) => account.id !== input.id)
      trash = [{ ...gone, deletedAt: "2026-11-06T01:00:00.000Z" }]
      return Promise.resolve(saved(trash[0]))
    },
    restore(input) {
      calls.push({ name: "restore", input })
      const back = { ...trash[0], deletedAt: null }
      trash = []
      live = [...live, back]
      return Promise.resolve(saved(back))
    },
    newId: () => "new-1",
    ...overrides,
  })
  return { store, calls }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("accounts store", () => {
  it("lists the household's accounts with the balances the server derived", async () => {
    const { store } = harness()
    await store.open(groupId)
    expect(store.accounts.value.map((account) => [account.id, account.balance])).toEqual([
      ["a", 700],
      ["b", 0],
    ])
  })

  it("creates an account with the id newId gives, the trimmed name and the amount in minor units", async () => {
    const { store, calls } = harness()
    await store.open(groupId)
    store.startCreate()
    store.change({
      name: "  Yen wallet ",
      kind: AccountKind.CASH,
      currency: "JPY",
      startingBalance: 500,
    })

    const created = await store.save()

    expect(calls).toEqual([{
      name: "create",
      input: {
        groupId,
        id: "new-1",
        name: "Yen wallet",
        kind: AccountKind.CASH,
        currency: "JPY",
        startingBalance: 500,
      },
    }])
    expect(created?.balance).toBe(500)
    expect(store.byId.value.get("new-1")?.currency).toBe("JPY")
  })

  it("makes one account when Save is pressed again after the first answer was lost", async () => {
    // The server keys a create by its id: a second create with the same id makes no second row.
    const rows = new Map<string, AccountItem>()
    let ids = 0
    let answers = 0
    const { store } = harness({
      newId: () => `new-${++ids}`,
      create(input) {
        if (!rows.has(input.id)) rows.set(input.id, item(input.id, input))
        if (++answers === 1) return Promise.reject(new Error("connection lost"))
        return Promise.resolve({ account: rows.get(input.id)! })
      },
    })
    await store.open(groupId)
    store.startCreate()
    store.change({ name: "Wallet", kind: AccountKind.CASH, currency: "USD", startingBalance: 0 })

    expect(await store.save()).toBeNull()
    await store.save()

    expect([...rows.keys()]).toEqual(["new-1"])
  })

  it("names both missing fields and calls nothing when the name and the currency are empty", async () => {
    const { store, calls } = harness()
    await store.open(groupId)
    store.startCreate()

    expect(await store.save()).toBe(null)

    expect(calls).toEqual([])
    expect(store.formErrors.value.name).toBe(ACCOUNT_MESSAGES.nameRequired)
    expect(store.formErrors.value.currency).toBe(ACCOUNT_MESSAGES.currencyRequired)
  })

  it("moves the balance with a changed starting balance, since the balance is derived from it", async () => {
    const { store } = harness()
    await store.open(groupId)
    store.startEdit("a")
    store.change({ ...store.form.value!, startingBalance: 600 })

    const saved = await store.save()

    expect(saved?.balance).toBe(800)
  })

  it("shows the account as it is now, with a message, when someone else changed it first", async () => {
    const { store } = harness({ update: () => Promise.reject(refused("VERSION_CONFLICT")) })
    await store.open(groupId)
    store.startEdit("a")
    store.change({ ...store.form.value!, name: "Mine" })

    expect(await store.save()).toBe(null)

    expect(store.form.value?.name).toBe("Cash")
    expect(store.formErrors.value.form).toBe(ACCOUNT_MESSAGES.conflict)
  })

  it("says how many accounts a household may have when the server refuses one more", async () => {
    const { store } = harness({ create: () => Promise.reject(refused("ACCOUNT_LIMIT_REACHED")) })
    await store.open(groupId)
    store.startCreate()
    store.change({ name: "One more", kind: AccountKind.BANK, currency: "EUR", startingBalance: 0 })

    await store.save()

    expect(store.formErrors.value.form).toEqual({
      key: `AccountMessages.limit`,
      values: { max: ACCOUNT_MAX_PER_GROUP },
    })
  })

  it("makes an account the default and reads the list again, so the old default loses its mark", async () => {
    const { store } = harness()
    await store.open(groupId)
    // "a" holds the mark first, as the server would have it before the change.
    store.accounts.value = store.accounts.value.map((account) => ({
      ...account,
      isDefault: account.id === "a",
    }))

    await store.setDefault("b", true)
    await settle()

    expect(store.accounts.value.filter((account) => account.isDefault).map((a) => a.id))
      .toEqual(["b"])
  })

  it("archives an account and keeps the balance it had", async () => {
    const { store, calls } = harness()
    await store.open(groupId)

    const archived = await store.archive("a", true)

    expect(calls).toEqual([{
      name: "archive",
      input: { groupId, id: "a", version: 1, archived: true },
    }])
    expect(archived?.archivedAt).not.toBe(null)
    expect(archived?.balance).toBe(700)
  })

  it("takes a deleted account out of the list, lists it in the trash, and Undo brings it back", async () => {
    const { store } = harness()
    await store.open(groupId)

    await store.remove("a")
    expect(store.byId.value.has("a")).toBe(false)
    await store.showDeleted(true)
    expect(store.deleted.value?.map((account) => account.id)).toEqual(["a"])

    await store.restore("a")
    await settle()
    expect(store.byId.value.has("a")).toBe(true)
    expect(store.deleted.value).toEqual([])
  })

  it("drops a read answered for a household that is no longer open", async () => {
    let answer: (all: AccountItem[]) => void = () => {}
    const { store } = harness({
      fetchList: (id) =>
        id === "g-old"
          ? new Promise((resolve) => answer = resolve)
          : Promise.resolve([item("new")]),
    })
    const first = store.open("g-old")
    await store.open(groupId)
    answer([item("old")])
    await first

    expect(store.accounts.value.map((account) => account.id)).toEqual(["new"])
  })
})
