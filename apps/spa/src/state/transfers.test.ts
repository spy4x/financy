import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { ConnectionLostError, RealtimeRequestError } from "@spy4x/realtime"
import {
  createTransfersStore,
  entryFromTransfer,
  prefillTransfer,
  TRANSFER_MESSAGES,
  type TransferFormValue,
  transferFromEntry,
  type TransferItem,
  type TransfersDependencies,
} from "./transfers.ts"

const groupId = "g-1"
const ACCOUNTS = new Map([["a-eur", "EUR"], ["a-eur-2", "EUR"], ["a-vnd", "VND"]])
const currencyOf = (id: string) => ACCOUNTS.get(id)

function transfer(id: string, overrides: Partial<TransferItem> = {}): TransferItem {
  return {
    id,
    groupId,
    fromAccountId: "a-eur",
    sentAmount: 20000,
    toAccountId: "a-vnd",
    receivedAmount: 6500000,
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

function refused(code: string, fields?: Record<string, { code: string }>) {
  return new RealtimeRequestError("conflict", "refused", { code }, fields ? { fields } : {})
}

/** A store over a server the test plays; `calls` records each write's input. */
function harness(overrides: Partial<TransfersDependencies> = {}, list = [transfer("x-1")]) {
  const calls: { name: string; input: Record<string, unknown> }[] = []
  let ids = 0
  const dependencies: TransfersDependencies = {
    fetchList: () => Promise.resolve(list),
    create(input) {
      calls.push({ name: "create", input: { ...input } })
      return Promise.resolve({ transfer: transfer(input.id, { ...input, receivedAmount: 1 }) })
    },
    update(input) {
      calls.push({ name: "update", input: { ...input } })
      return Promise.resolve({
        transfer: transfer(input.id, { ...input, version: input.version + 1 }),
      })
    },
    delete(input) {
      calls.push({ name: "delete", input: { ...input } })
      return Promise.resolve()
    },
    restore: (input) => Promise.resolve({ transfer: transfer(input.id, { version: 3 }) }),
    newId: () => `new-${++ids}`,
    ...overrides,
  }
  const store = createTransfersStore(dependencies, { accountCurrency: currencyOf })
  return { store, calls }
}

const blank: TransferFormValue = {
  fromAccountId: "a-eur",
  toAccountId: null,
  sentAmount: null,
  receivedAmount: null,
  date: "2026-11-12",
  memo: "",
}

describe("transfers store", () => {
  describe("change", () => {
    it("clears To when From is set to the same account", async () => {
      const { store } = harness()
      await store.open(groupId)
      store.startCreate({ ...blank, fromAccountId: "a-vnd", toAccountId: "a-eur" })
      store.change({ fromAccountId: "a-eur" })
      expect(store.form.value?.toAccountId).toBe(null)
    })

    it("drops the received amount when either account changes", async () => {
      const { store } = harness()
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 100, receivedAmount: 50 })
      store.change({ toAccountId: "a-eur-2" })
      expect(store.form.value?.receivedAmount).toBe(null)
    })

    it("drops a received amount typed between two accounts of one currency", async () => {
      const { store } = harness()
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-eur-2" })
      store.change({ receivedAmount: 50 })
      expect(store.form.value?.receivedAmount).toBe(null)
    })

    it("keeps a received amount typed across currencies", async () => {
      const { store } = harness()
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd" })
      store.change({ sentAmount: 100 })
      store.change({ receivedAmount: 3250000 })
      store.change({ sentAmount: 200 })
      expect(store.form.value?.receivedAmount).toBe(3250000)
    })

    it("on a saved transfer, a new sent amount clears the received amount the person left alone", async () => {
      const { store } = harness()
      await store.open(groupId)
      store.startEdit("x-1")
      expect(store.form.value?.receivedAmount).toBe(6500000)
      store.change({ sentAmount: 30000 })
      expect(store.form.value?.receivedAmount).toBe(null)
    })

    it("on a saved transfer, a received amount the person typed stays when the sent amount changes", async () => {
      const { store } = harness()
      await store.open(groupId)
      store.startEdit("x-1")
      store.change({ receivedAmount: 7000000 })
      store.change({ sentAmount: 30000 })
      expect(store.form.value?.receivedAmount).toBe(7000000)
    })

    it("opens a converted transfer with the received amount empty, so the server's stays", async () => {
      const { store } = harness({}, [transfer("x-1", { converted: true })])
      await store.open(groupId)
      store.startEdit("x-1")
      expect(store.form.value?.receivedAmount).toBe(null)
      expect(store.unsaved.value).toBe(false)
    })

    it("drops the rate prompt once the date changes", async () => {
      const { store } = harness({ create: () => Promise.reject(refused("NO_RATE")) })
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 100 })
      await store.save()
      expect(store.formErrors.value.noRate).toBe(true)
      store.change({ date: "2026-11-11" })
      expect(store.formErrors.value.noRate).toBe(false)
    })
  })

  describe("save", () => {
    it("names each missing field and sends nothing", async () => {
      const { store, calls } = harness()
      await store.open(groupId)
      store.startCreate({ ...blank, fromAccountId: null })
      expect(await store.save()).toBe(null)
      expect(store.formErrors.value.from).toBe(TRANSFER_MESSAGES.fromRequired)
      expect(store.formErrors.value.to).toBe(TRANSFER_MESSAGES.toRequired)
      expect(store.formErrors.value.sentAmount).toBe(TRANSFER_MESSAGES.amountRequired)
      expect(calls).toEqual([])
    })

    it("sends no received amount when it is left empty, so the server converts", async () => {
      const { store, calls } = harness()
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 20000, memo: " Trip " })
      await store.save()
      expect(calls).toEqual([{
        name: "create",
        input: {
          groupId,
          id: "new-1",
          fromAccountId: "a-eur",
          toAccountId: "a-vnd",
          sentAmount: 20000,
          memo: "Trip",
          date: "2026-11-12",
        },
      }])
    })

    it("sends a typed received amount across currencies", async () => {
      const { store, calls } = harness()
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 20000 })
      store.change({ receivedAmount: 6500000 })
      await store.save()
      expect(calls[0].input.receivedAmount).toBe(6500000)
    })

    it("makes the received amount required after NO_RATE, and sends it once typed", async () => {
      let refuse = true
      const { store, calls } = harness({
        create(input) {
          calls.push({ name: "create", input: { ...input } })
          return refuse
            ? Promise.reject(refused("NO_RATE"))
            : Promise.resolve({ transfer: transfer(input.id) })
        },
      })
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 20000 })
      await store.save()
      expect(store.formErrors.value.noRate).toBe(true)
      expect(store.formErrors.value.receivedAmount).not.toBe(null)
      expect(await store.save()).toBe(null)
      expect(calls.length).toBe(1)
      refuse = false
      store.change({ receivedAmount: 6500000 })
      expect(await store.save()).not.toBe(null)
      expect(calls[1].input.receivedAmount).toBe(6500000)
    })

    it("shows a version conflict with the other person's change", async () => {
      const latest = transfer("x-1", { version: 2, memo: "Theirs" })
      let list = [transfer("x-1")]
      const { store } = harness({
        fetchList: () => Promise.resolve(list),
        update: () => Promise.reject(refused("VERSION_CONFLICT")),
      })
      await store.open(groupId)
      store.startEdit("x-1")
      store.change({ memo: "Mine" })
      list = [latest]
      await store.save()
      expect(store.formErrors.value.form).toBe(TRANSFER_MESSAGES.conflict)
      expect(store.form.value?.memo).toBe("Theirs")
    })

    it("closes the editor with a message when the transfer is gone", async () => {
      let list = [transfer("x-1")]
      const { store } = harness({
        fetchList: () => Promise.resolve(list),
        update: () => Promise.reject(refused("TRANSFER_NOT_FOUND")),
      })
      await store.open(groupId)
      store.startEdit("x-1")
      store.change({ memo: "Mine" })
      list = []
      await store.save()
      expect(store.form.value).toBe(null)
      expect(store.formErrors.value.form).toBe(TRANSFER_MESSAGES.gone)
    })

    it("names the account the server no longer has, on its own side", async () => {
      const { store } = harness({
        create: () => Promise.reject(refused("ACCOUNT_NOT_FOUND", { toAccountId: { code: "notFound" } })),
      })
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 1 })
      await store.save()
      expect(store.formErrors.value.to).toBe(TRANSFER_MESSAGES.accountGone)
      expect(store.formErrors.value.from).toBe(null)
    })

    it("sends a new id after the server says the draft's id is taken", async () => {
      const { store, calls } = harness({
        create(input) {
          calls.push({ name: "create", input: { ...input } })
          return Promise.reject(refused("ID_ALREADY_EXISTS"))
        },
      })
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 1 })
      await store.save()
      await store.save()
      expect(calls.map((call) => call.input.id)).toEqual(["new-1", "new-2"])
      expect(store.formErrors.value.form).toBe(TRANSFER_MESSAGES.create)
    })

    it("says the save failed under the form when the server cannot be reached", async () => {
      const { store } = harness({
        create: () => Promise.reject(new ConnectionLostError("offline")),
      })
      await store.open(groupId)
      store.startCreate({ ...blank, toAccountId: "a-vnd", sentAmount: 1 })
      expect(await store.save()).toBe(null)
      expect(store.formErrors.value.form).not.toBe(null)
    })
  })

  describe("delete and undo", () => {
    it("deletes at the version seen, then Undo restores the same transfer", async () => {
      const restored: string[] = []
      const { store, calls } = harness({
        restore(input) {
          restored.push(input.id)
          return Promise.resolve({ transfer: transfer(input.id, { version: 3 }) })
        },
      })
      await store.open(groupId)
      expect(await store.remove("x-1")).toBe(true)
      expect(calls).toEqual([{ name: "delete", input: { groupId, id: "x-1", version: 1 } }])
      expect(store.transfers.value).toEqual([])
      expect(store.undo.value?.id).toBe("x-1")
      expect(await store.undoDelete()).toBe(true)
      expect(restored).toEqual(["x-1"])
      expect(store.transfers.value.map((item) => item.id)).toEqual(["x-1"])
      expect(store.undo.value).toBe(null)
    })

    it("says Undo needs the network when the restore cannot reach the server", async () => {
      const { store } = harness({
        restore: () => Promise.reject(new ConnectionLostError("offline")),
      })
      await store.open(groupId)
      await store.remove("x-1")
      expect(await store.undoDelete()).toBe(false)
      expect(store.listError.value).toBe(TRANSFER_MESSAGES.restoreOffline)
    })
  })
})

describe("prefillTransfer", () => {
  it("starts from the default account, with no To and today's date", () => {
    expect(prefillTransfer([
      { id: "a-old", isDefault: true, archivedAt: "2026-01-01T00:00:00.000Z" },
      { id: "a-1", isDefault: false, archivedAt: null },
      { id: "a-2", isDefault: true, archivedAt: null },
    ], "2026-11-12")).toEqual({
      fromAccountId: "a-2",
      toAccountId: null,
      sentAmount: null,
      receivedAmount: null,
      date: "2026-11-12",
      memo: "",
    })
  })

  it("starts with no From when there is no account", () => {
    expect(prefillTransfer([], "2026-11-12").fromAccountId).toBe(null)
  })
})

describe("the kind control's carry-over", () => {
  const entry = {
    amount: 1250,
    currency: "EUR",
    accountId: "a-eur",
    date: "2026-11-09",
    memo: "ATM",
  }

  it("carries an entry's account, amount, date and memo to a new transfer", () => {
    expect(transferFromEntry(entry, currencyOf)).toEqual({
      fromAccountId: "a-eur",
      sentAmount: 1250,
      date: "2026-11-09",
      memo: "ATM",
    })
  })

  it("leaves the amount behind when it is not in the account's currency", () => {
    expect(transferFromEntry({ ...entry, currency: "USD" }, currencyOf).sentAmount)
      .toBe(undefined)
  })

  it("carries a transfer's From, sent amount, date and memo back to a new entry", () => {
    expect(entryFromTransfer({ ...blank, sentAmount: 900, memo: "ATM" }, currencyOf)).toEqual({
      accountId: "a-eur",
      currency: "EUR",
      amount: 900,
      date: "2026-11-12",
      memo: "ATM",
    })
  })
})
