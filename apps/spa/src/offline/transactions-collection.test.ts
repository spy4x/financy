import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { ConnectionLostError, RealtimeRequestError } from "@spy4x/realtime"
import type { CallPort } from "@spy4x/realtime/calls"
import { createCollections } from "@spy4x/realtime/collections"
import { createMemoryOutboxStore } from "@spy4x/realtime/outbox"
import { TransactionKind } from "@domain/transactions"
import type { TransactionItem, TransactionsDependencies } from "../state/transactions.ts"
import { createMemoryTransactionsCache } from "./memory-transactions-cache.ts"
import type { TransactionPayload } from "./transactions-cache.ts"
import {
  goneReference,
  offlineTransactions,
  REFERENCE_GONE,
  transactionsCollection,
} from "./transactions-collection.ts"

const groupId = "g-1"

function entry(id: string, overrides: Partial<TransactionItem> = {}): TransactionItem {
  return {
    id,
    groupId,
    accountId: "a-usd",
    categoryId: "c-food",
    kind: TransactionKind.EXPENSE,
    accountAmount: -488,
    amount: -450,
    currency: "EUR",
    converted: true,
    memo: "Coffee",
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

interface Sent {
  name: string
  payload: Record<string, unknown>
}

/** The entries of user 1 on one memory device, over a server the test plays. */
function harness() {
  const sent: Sent[] = []
  const state = {
    online: true,
    server: (call: Sent): unknown => ({ transaction: entry(String(call.payload.id)) }),
  }
  const calls: CallPort = {
    async command(name, payload) {
      const call = { name, payload: payload as Record<string, unknown> }
      sent.push(call)
      if (!state.online) throw new ConnectionLostError("the socket is not open")
      return await state.server(call)
    },
    query: (name) => Promise.reject(new Error(`unexpected query ${name}`)),
  }
  const cache = createMemoryTransactionsCache()
  const definition = transactionsCollection({
    userId: 1,
    cache,
    store: createMemoryOutboxStore<TransactionPayload, TransactionItem>(),
  })
  const collections = createCollections({
    collections: [definition],
    calls,
    canSend: () => state.online,
    now: () => "2026-11-12T09:00:00.000Z",
  })
  const transactions = collections.get(definition)
  const restored: string[] = []
  const online: TransactionsDependencies = {
    fetchList: () => Promise.reject(new Error("the layer reads the copy")),
    fetchDeleted: () => Promise.resolve([]),
    create: () => Promise.reject(new Error("the layer queues it")),
    update: () => Promise.reject(new Error("the layer queues it")),
    delete: () => Promise.reject(new Error("the layer queues it")),
    restore(input) {
      restored.push(input.id)
      return Promise.resolve({ transaction: entry(input.id, { version: 3 }) })
    },
    newId: () => "unused",
  }
  const layer = {
    copy: { pull: () => Promise.resolve(), drop: () => Promise.resolve() },
    transactionsCache: cache,
    transactions,
  }
  const dependencies = offlineTransactions(online, () => layer)
  return { sent, state, cache, transactions, dependencies, restored }
}

function refused(code: string) {
  return new RealtimeRequestError("conflict", "refused", { code })
}

const typed = {
  groupId,
  id: "t-new",
  accountId: "a-usd",
  categoryId: "c-food",
  kind: TransactionKind.EXPENSE,
  amount: 450,
  currency: "EUR",
  memo: "Coffee",
  date: "2026-11-12",
  accountCurrency: "USD",
}

describe("the entries queue", () => {
  it("sends only what the server reads: the account's currency stays on the device", async () => {
    const { dependencies, sent } = harness()

    await dependencies.create(typed)

    expect(sent).toEqual([{
      name: "transaction.create",
      payload: {
        groupId,
        id: "t-new",
        accountId: "a-usd",
        categoryId: "c-food",
        kind: TransactionKind.EXPENSE,
        amount: 450,
        currency: "EUR",
        memo: "Coffee",
        date: "2026-11-12",
      },
    }])
  })

  it("sends a stated account amount, the person's own rate", async () => {
    const { dependencies, sent } = harness()

    await dependencies.create({ ...typed, accountAmount: 500 })

    expect(sent[0].payload.accountAmount).toBe(500)
  })

  it("shows an expense in another currency, queued offline, as converted once back online", async () => {
    const { dependencies, state } = harness()
    state.online = false

    const { transaction } = await dependencies.create(typed)

    expect(transaction).toMatchObject({
      version: 0,
      amount: -450,
      accountAmount: 0,
      converted: true,
      createdByUserId: 1,
    })
  })

  it("shows an income queued in the account's own currency with both amounts the same", async () => {
    const { dependencies, state } = harness()
    state.online = false

    const { transaction } = await dependencies.create({
      ...typed,
      kind: TransactionKind.INCOME,
      currency: "USD",
    })

    expect(transaction).toMatchObject({ amount: 450, accountAmount: 450, converted: false })
  })

  it("keeps the converted amount of an offline edit that changes only the memo", async () => {
    const { dependencies, state, cache } = harness()
    await cache.putTransaction(entry("t-1"))
    state.online = false

    const { transaction } = await dependencies.update({
      ...typed,
      id: "t-1",
      date: "2026-11-10",
      memo: "Espresso",
      version: 1,
    })

    expect(transaction).toMatchObject({ memo: "Espresso", accountAmount: -488, converted: true })
  })

  it("answers a refused write with the server's code and queues nothing", async () => {
    const { dependencies, state, transactions } = harness()
    state.server = () => {
      throw refused("NO_RATE")
    }

    const failure = await dependencies.create(typed).catch((error) => error)

    expect((failure as RealtimeRequestError).details).toEqual({ code: "NO_RATE" })
    expect(transactions.outbox.entries()).toEqual([])
  })

  it("takes back a delete still on the device without asking the server", async () => {
    const { dependencies, state, cache, restored } = harness()
    await cache.putTransaction(entry("t-1"))
    state.online = false
    await dependencies.delete({ groupId, id: "t-1", version: 1 })
    expect(await dependencies.fetchList(groupId)).toEqual([])

    const { transaction } = await dependencies.restore({ groupId, id: "t-1" })

    expect(transaction.id).toBe("t-1")
    expect(restored).toEqual([])
    expect((await dependencies.fetchList(groupId)).map((row) => row.id)).toEqual(["t-1"])
  })

  it("restores a delete the server already has through the server", async () => {
    const { dependencies, restored, cache } = harness()

    await dependencies.restore({ groupId, id: "t-9" })

    expect(restored).toEqual(["t-9"])
    expect((await cache.readTransactions(groupId)).map((row) => row.id)).toEqual(["t-9"])
  })

  for (const reference of ["account", "category"] as const) {
    const code = reference === "account" ? "ACCOUNT_NOT_FOUND" : "CATEGORY_NOT_FOUND"

    it(`keeps an offline entry whose ${reference} was deleted as a conflict, sent once`, async () => {
      const { dependencies, state, transactions, sent } = harness()
      state.online = false
      await dependencies.create(typed)
      state.online = true
      state.server = () => {
        throw new RealtimeRequestError("not_found", "Account not found", { code })
      }

      await transactions.outbox.flush()
      await transactions.outbox.flush()

      const [queued] = transactions.outbox.entries()
      expect(queued).toMatchObject({ status: "conflict", entityId: "t-new" })
      expect(queued.conflict?.message).toBe(REFERENCE_GONE[reference])
      expect(goneReference(queued)).toBe(reference)
      expect(sent.filter((call) => call.payload.id === "t-new").length).toBe(1)
      expect((await dependencies.fetchList(groupId)).map((row) => row.id)).toEqual(["t-new"])
    })
  }

  it("sends a conflicted entry again with the account picked instead, and clears it", async () => {
    const { dependencies, state, transactions, sent } = harness()
    state.online = false
    await dependencies.create(typed)
    state.online = true
    state.server = () => {
      throw new RealtimeRequestError("not_found", "Account not found", {
        code: "ACCOUNT_NOT_FOUND",
      })
    }
    await transactions.outbox.flush()
    state.server = (call) => ({
      transaction: entry(String(call.payload.id), { accountId: "a-eur" }),
    })

    const { transaction } = await dependencies.update({
      ...typed,
      accountId: "a-eur",
      accountCurrency: "EUR",
      version: 0,
    })

    expect(sent.at(-1)).toMatchObject({
      name: "transaction.create",
      payload: { id: "t-new", accountId: "a-eur" },
    })
    expect(transactions.outbox.entries()).toEqual([])
    expect(transaction.accountId).toBe("a-eur")
  })

  it("discards a conflicted entry from the device without sending it", async () => {
    const { dependencies, state, transactions, sent } = harness()
    state.online = false
    await dependencies.create(typed)
    state.online = true
    state.server = () => {
      throw new RealtimeRequestError("not_found", "Account not found", {
        code: "CATEGORY_NOT_FOUND",
      })
    }
    await transactions.outbox.flush()
    const before = sent.length

    await transactions.outbox.useTheirs(transactions.outbox.entries()[0])

    expect(transactions.outbox.entries()).toEqual([])
    expect(await dependencies.fetchList(groupId)).toEqual([])
    expect(sent.length).toBe(before)
  })

  it("keeps the server's words, and no gone reference, for any other refusal", async () => {
    const { dependencies, state, transactions } = harness()
    state.online = false
    await dependencies.create(typed)
    state.online = true
    state.server = () => {
      throw new RealtimeRequestError("conflict", "No rate for that day", { code: "NO_RATE" })
    }

    await transactions.outbox.flush()

    const [queued] = transactions.outbox.entries()
    expect(queued.conflict?.message).toBe("No rate for that day")
    expect(goneReference(queued)).toBe(null)
  })
})
