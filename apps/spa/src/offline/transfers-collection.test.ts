import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { ConnectionLostError, RealtimeRequestError } from "@spy4x/realtime"
import type { CallPort } from "@spy4x/realtime/calls"
import { createCollections } from "@spy4x/realtime/collections"
import { createMemoryOutboxStore } from "@spy4x/realtime/outbox"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import app from "@i18n/app/en.ts"
import { transferRowName } from "@ui/transfer-parts.tsx"
import type { TransferItem, TransfersDependencies } from "../state/transfers.ts"
import { transferRow } from "../views/transfer-rows.ts"
import { createMemoryTransfersCache } from "./memory-transfers-cache.ts"
import type { TransferPayload } from "./transfers-cache.ts"
import {
  goneAccount,
  offlineTransfers,
  TRANSFER_ACCOUNT_GONE,
  transfersCollection,
} from "./transfers-collection.ts"

const groupId = "g-1"
const currencies: Record<string, string> = { "a-usd": "USD", "a-eur": "EUR", "a-cash": "EUR" }

function transfer(id: string, overrides: Partial<TransferItem> = {}): TransferItem {
  return {
    id,
    groupId,
    fromAccountId: "a-usd",
    toAccountId: "a-eur",
    sentAmount: 20000,
    receivedAmount: 18500,
    converted: true,
    memo: "ATM",
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

/** The transfers of user 1 on one memory device, over a server the test plays. */
function harness() {
  const sent: Sent[] = []
  const state = {
    online: true,
    server: (call: Sent): unknown => ({ transfer: transfer(String(call.payload.id)) }),
  }
  const calls: CallPort = {
    async command(name, payload) {
      const call = { name, payload: payload as Record<string, unknown> }
      sent.push(call)
      if (!state.online) throw new ConnectionLostError("the socket is not open")
      return await state.server(call)
    },
    async query(name, payload) {
      const call = { name, payload: payload as Record<string, unknown> }
      sent.push(call)
      return await state.server(call)
    },
  }
  const cache = createMemoryTransfersCache()
  const definition = transfersCollection({
    userId: 1,
    cache,
    store: createMemoryOutboxStore<TransferPayload, TransferItem>(),
  })
  const collections = createCollections({
    collections: [definition],
    calls,
    canSend: () => state.online,
    now: () => "2026-11-12T09:00:00.000Z",
  })
  const transfers = collections.get(definition)
  const restored: string[] = []
  const online: TransfersDependencies = {
    fetchList: () => Promise.reject(new Error("the layer reads the copy")),
    create: () => Promise.reject(new Error("the layer queues it")),
    update: () => Promise.reject(new Error("the layer queues it")),
    delete: () => Promise.reject(new Error("the layer queues it")),
    restore(input) {
      restored.push(input.id)
      return Promise.resolve({ transfer: transfer(input.id, { version: 3 }) })
    },
    newId: () => "unused",
  }
  const layer = {
    copy: { pull: () => Promise.resolve(), drop: () => Promise.resolve() },
    transfersCache: cache,
    transfers,
  }
  const dependencies = offlineTransfers(online, () => layer, (id) => currencies[id])
  return { sent, state, cache, transfers, dependencies, restored }
}

function refused(code: string, message = "refused") {
  return new RealtimeRequestError("conflict", message, { code })
}

const typed = {
  groupId,
  id: "tr-new",
  fromAccountId: "a-usd",
  toAccountId: "a-eur",
  sentAmount: 20000,
  memo: "ATM",
  date: "2026-11-12",
}

/** A create queued offline, then refused with `code` once the connection returns. */
async function refusedAfterReconnect(code: string, message = "refused") {
  const run = harness()
  run.state.online = false
  await run.dependencies.create(typed)
  run.state.online = true
  run.state.server = () => {
    throw refused(code, message)
  }
  await run.transfers.outbox.flush()
  return run
}

describe("the transfers queue", () => {
  it("sends only what the server reads: the accounts' currencies stay on the device", async () => {
    const { dependencies, sent } = harness()

    await dependencies.create(typed)

    expect(sent).toEqual([{ name: "transfer.create", payload: typed }])
  })

  it("sends a stated received amount, the person's own rate, and the version of an edit", async () => {
    const { dependencies, sent, cache } = harness()
    await cache.putTransfer(transfer("tr-1"))

    await dependencies.update({ ...typed, id: "tr-1", receivedAmount: 18000, version: 1 })

    expect(sent).toEqual([{
      name: "transfer.update",
      payload: { ...typed, id: "tr-1", receivedAmount: 18000, version: 1 },
    }])
  })

  it("shows a transfer across currencies, queued offline, as converted once back online", async () => {
    const { dependencies, state } = harness()
    state.online = false

    const { transfer: queued } = await dependencies.create(typed)

    expect(queued).toMatchObject({
      version: 0,
      sentAmount: 20000,
      receivedAmount: 0,
      converted: true,
      createdByUserId: 1,
    })
  })

  it("shows a transfer queued between accounts of one currency as received in full", async () => {
    const { dependencies, state } = harness()
    state.online = false

    const { transfer: queued } = await dependencies.create({
      ...typed,
      fromAccountId: "a-cash",
    })

    expect(queued).toMatchObject({ receivedAmount: 20000, converted: false })
  })

  it("shows a stated received amount on a queued transfer as typed, not converted", async () => {
    const { dependencies, state } = harness()
    state.online = false

    const { transfer: queued } = await dependencies.create({ ...typed, receivedAmount: 18000 })

    expect(queued).toMatchObject({ receivedAmount: 18000, converted: false })
  })

  it("keeps the received amount of an offline edit that changes only the memo", async () => {
    const { dependencies, state, cache } = harness()
    await cache.putTransfer(transfer("tr-1"))
    state.online = false

    const { transfer: edited } = await dependencies.update({
      ...typed,
      id: "tr-1",
      date: "2026-11-10",
      memo: "Cash for the market",
      version: 1,
    })

    expect(edited).toMatchObject({
      memo: "Cash for the market",
      receivedAmount: 18500,
      converted: true,
    })
  })

  it("says an offline edit of a saved transfer's amount across currencies is converted later", async () => {
    const { dependencies, state, cache } = harness()
    await cache.putTransfer(transfer("tr-1"))
    state.online = false

    const { transfer: edited } = await dependencies.update({
      ...typed,
      id: "tr-1",
      sentAmount: 30000,
      date: "2026-11-10",
      version: 1,
    })
    const t = createTranslator({ language: `en`, catalogs: [{ source: app }] })
    const row = transferRow(edited, {
      t,
      accounts: [
        { id: "a-usd", name: "Card", currency: "USD", archived: false },
        { id: "a-eur", name: "Wallet", currency: "EUR", archived: false },
      ],
      youId: 1,
      members: [],
    })

    expect(edited.version).toBe(1)
    expect(row.queued).toBe(true)
    expect(transferRowName(t, row, "en-GB", "2026-11-10").replace(/[⁨⁩]/g, ""))
      .toBe("Transfer of US$300.00 from Card to Wallet, Today")
  })

  it("answers a refused write with the server's code and queues nothing", async () => {
    const { dependencies, state, transfers } = harness()
    state.server = () => {
      throw refused("TRANSFER_SAME_ACCOUNT")
    }

    const failure = await dependencies.create(typed).catch((error) => error)

    expect((failure as RealtimeRequestError).details).toEqual({ code: "TRANSFER_SAME_ACCOUNT" })
    expect(transfers.outbox.entries()).toEqual([])
  })

  it("sends a create queued offline once the connection returns, once", async () => {
    const { dependencies, state, transfers, sent, cache } = harness()
    state.online = false
    await dependencies.create(typed)
    state.online = true

    await transfers.outbox.flush()
    await transfers.outbox.flush()

    expect(sent.filter((call) => call.payload.id === "tr-new").length).toBe(1)
    expect(transfers.outbox.entries()).toEqual([])
    expect((await cache.readTransfers(groupId)).map((row) => row.id)).toEqual(["tr-new"])
  })

  it("takes back a delete still on the device without asking the server", async () => {
    const { dependencies, state, cache, restored } = harness()
    await cache.putTransfer(transfer("tr-1"))
    state.online = false
    await dependencies.delete({ groupId, id: "tr-1", version: 1 })
    expect(await dependencies.fetchList(groupId)).toEqual([])

    const { transfer: back } = await dependencies.restore({ groupId, id: "tr-1" })

    expect(back.id).toBe("tr-1")
    expect(restored).toEqual([])
    expect((await dependencies.fetchList(groupId)).map((row) => row.id)).toEqual(["tr-1"])
  })

  it("keeps a queued delete's amount and currencies for the conflict screen", async () => {
    const { dependencies, state, cache, transfers } = harness()
    await cache.putTransfer(transfer("tr-1"))
    state.online = false

    await dependencies.delete({ groupId, id: "tr-1", version: 1 })

    expect(transfers.outbox.entries()[0].payload).toMatchObject({
      sentAmount: 20000,
      fromCurrency: "USD",
      toCurrency: "EUR",
      memo: "ATM",
    })
  })

  it("restores a delete the server already has through the server", async () => {
    const { dependencies, restored, cache } = harness()

    await dependencies.restore({ groupId, id: "tr-9" })

    expect(restored).toEqual(["tr-9"])
    expect((await cache.readTransfers(groupId)).map((row) => row.id)).toEqual(["tr-9"])
  })

  it("keeps an offline transfer whose account was deleted as a conflict with its own reason", async () => {
    const { dependencies, transfers, sent } = await refusedAfterReconnect("ACCOUNT_NOT_FOUND")
    await transfers.outbox.flush()

    const [queued] = transfers.outbox.entries()
    expect(queued).toMatchObject({ status: "conflict", entityId: "tr-new" })
    expect(queued.conflict?.message).toBe(TRANSFER_ACCOUNT_GONE)
    expect(goneAccount(queued)).toBe(true)
    // The second flush sends nothing: a refused transfer waits for the person.
    expect(sent.filter((call) => call.payload.id === "tr-new").length).toBe(1)
    expect((await dependencies.fetchList(groupId)).map((row) => row.id)).toEqual(["tr-new"])
  })

  it("sends a conflicted transfer again with the account picked instead, and clears it", async () => {
    const { dependencies, state, transfers, sent } = await refusedAfterReconnect(
      "ACCOUNT_NOT_FOUND",
    )
    state.server = (call) => ({
      transfer: transfer(String(call.payload.id), { toAccountId: "a-cash" }),
    })

    const { transfer: sentAgain } = await dependencies.update({
      ...typed,
      toAccountId: "a-cash",
      version: 0,
    })

    expect(sent.at(-1)).toMatchObject({
      name: "transfer.create",
      payload: { id: "tr-new", toAccountId: "a-cash" },
    })
    expect(transfers.outbox.entries()).toEqual([])
    expect(sentAgain.toAccountId).toBe("a-cash")
  })

  it("keeps the server's words, and no gone account, for any other refusal", async () => {
    const { transfers } = await refusedAfterReconnect("GROUP_NOT_FOUND", "No such household")

    const [queued] = transfers.outbox.entries()
    expect(queued.conflict?.message).toBe("No such household")
    expect(goneAccount(queued)).toBe(false)
  })

  it("names a version conflict and a deleted transfer with the transfers' own wording", async () => {
    for (
      const [code, message] of [
        ["VERSION_CONFLICT", `TransferSync.version`],
        ["TRANSFER_NOT_FOUND", `TransferSync.gone`],
      ]
    ) {
      const { dependencies, state, cache, transfers } = harness()
      await cache.putTransfer(transfer("tr-1"))
      state.online = false
      await dependencies.update({ ...typed, id: "tr-1", memo: "Changed", version: 1 })
      state.online = true
      // The client asks the server for its copy to show next to the person's; a deleted transfer
      // has none.
      state.server = (call) => {
        if (call.name === "transfer.update" || code === "TRANSFER_NOT_FOUND") throw refused(code)
        return { transfer: transfer("tr-1", { version: 2 }) }
      }

      await transfers.outbox.flush()

      const [queued] = transfers.outbox.entries()
      expect(queued?.conflict?.message).toBe(message)
      expect(goneAccount(queued)).toBe(false)
    }
  })
})
