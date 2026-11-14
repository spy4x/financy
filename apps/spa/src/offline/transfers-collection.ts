import {
  classifyByCode,
  type Collection,
  type CollectionDefinition,
  defineCollection,
} from "@spy4x/realtime/collections"
import type { OutboxStore, SendFailure } from "@spy4x/realtime/outbox"
import type { TransferFields, TransferItem, TransfersDependencies } from "../state/transfers.ts"
import {
  type TransferEntry,
  type TransferPayload,
  type TransfersCache,
  transfersQueueDatabase,
} from "./transfers-cache.ts"
import { type DeviceCopy, pullOrKeep } from "./device-copy.ts"

/**
 * The transfers adapter: what is the transfers' own about being offline-writable (ADR 003, level
 * 3), as `transactions-collection.ts` is for entries. The two accounts a transfer names are level
 * 2: they are never queued, so a transfer depends on no other queue. A queued transfer whose
 * account is gone by the time it is sent is the library's ordinary refusal, kept as a conflict with
 * its own reason ({@link goneAccount}) so the list can offer another account.
 */

/** The collection's name in the queue. */
export const TRANSFERS_COLLECTION = "transfers"

/** The transfers as a collection: a transfer is the entity and the row, what was typed the payload. */
export type TransfersCollection = Collection<TransferPayload, TransferItem, TransferItem>

/** What {@link transfersCollection} is built from. */
export interface TransfersCollectionOptions {
  /** The queue's owner: the database is named for them, and a queued transfer is shown as theirs. */
  userId: number
  /** The device's copy of the transfers, kept in step with the server's answers. */
  cache: TransfersCache
  /** A queue to use instead of IndexedDB: the tests, which have none. */
  store?: OutboxStore<TransferPayload, TransferItem>
}

/**
 * The reason a queued transfer is refused when one of its two accounts is gone: the conflict's
 * message, a key of the `app` catalog.
 */
export const TRANSFER_ACCOUNT_GONE = `TransferSync.accountGone`

const classifyByServerCode = classifyByCode({
  version: "VERSION_CONFLICT",
  notFound: "TRANSFER_NOT_FOUND",
  alreadyExists: "ID_ALREADY_EXISTS",
})

/**
 * Reads a failed transfer call: unreachable (try later) or the server's refusal and its code. A
 * refusal because an account is gone carries {@link TRANSFER_ACCOUNT_GONE} instead of the server's
 * English words.
 */
export function classifyTransferError(error: unknown): SendFailure {
  const failure = classifyByServerCode(error)
  if (failure.kind !== "rejected") return failure
  const code = (error as { details?: { code?: unknown } }).details?.code
  if (code === "ACCOUNT_NOT_FOUND") return { kind: "rejected", message: TRANSFER_ACCOUNT_GONE }
  return failure
}

/**
 * Whether a queued transfer is in conflict because an account it names is gone: `false` for one
 * that is waiting, or in conflict for another reason.
 */
export function goneAccount(entry: TransferEntry): boolean {
  return entry.status === "conflict" && entry.conflict?.message === TRANSFER_ACCOUNT_GONE
}

/**
 * The received amount a queued transfer shows with before the server answers. Between two
 * accounts of one currency it is the sent amount; a stated one is used as it is; otherwise the
 * server converts later, so the transfer shows as converted with no received amount yet (`0`), or
 * with the one it had when nothing that decides it changed.
 */
export function queuedReceived(
  payload: TransferPayload,
  previous?: TransferItem,
): Pick<TransferItem, "receivedAmount" | "converted"> {
  if (payload.fromCurrency === payload.toCurrency) {
    return { receivedAmount: payload.sentAmount, converted: false }
  }
  if (payload.receivedAmount !== null) {
    return { receivedAmount: payload.receivedAmount, converted: false }
  }
  const unchanged = previous && previous.fromAccountId === payload.fromAccountId &&
    previous.toAccountId === payload.toAccountId && previous.sentAmount === payload.sentAmount &&
    previous.date === payload.date
  return { receivedAmount: unchanged ? previous.receivedAmount : 0, converted: true }
}

/**
 * The transfers of one user as an offline-writable collection, queued in
 * `offline:user:<id>:transfers-outbox`.
 */
export function transfersCollection(
  { userId, cache, store }: TransfersCollectionOptions,
): CollectionDefinition<TransferPayload, TransferItem, TransferItem> {
  return defineCollection<TransferPayload, TransferItem, TransferItem>({
    name: TRANSFERS_COLLECTION,
    database: transfersQueueDatabase(userId),
    store,
    toCall({ kind, entityId, payload, baseVersion }) {
      const base = { groupId: payload.groupId, id: entityId }
      if (kind === "delete") {
        return { name: "transfer.delete", payload: { ...base, version: baseVersion } }
      }
      // The currencies are the device's own note; the server reads them from the accounts.
      const fields = {
        fromAccountId: payload.fromAccountId,
        toAccountId: payload.toAccountId,
        sentAmount: payload.sentAmount,
        ...(payload.receivedAmount === null ? {} : { receivedAmount: payload.receivedAmount }),
        memo: payload.memo,
        date: payload.date,
      }
      return kind === "create"
        ? { name: "transfer.create", payload: { ...base, ...fields } }
        : { name: "transfer.update", payload: { ...base, ...fields, version: baseVersion } }
    },
    toQuery: (id, payload) => ({ name: "transfer.get", payload: { groupId: payload.groupId, id } }),
    entityFrom: (answer) => (answer as { transfer?: TransferItem } | undefined)?.transfer,
    classify: classifyTransferError,
    // Keys of the `app` catalog, shown by `OfflineStatus` in the person's language at that time. A
    // refusal that carries the server's own words (no rate for the date) keeps those instead of
    // `rejected`; an account gone carries its own key (`classifyTransferError`).
    messages: {
      version: `TransferSync.version`,
      gone: `TransferSync.gone`,
      rejected: `TransferSync.rejected`,
    },
    cache: {
      put: (transfer) => cache.putTransfer(transfer),
      remove: (transferId) => cache.removeTransfer(transferId),
    },
    itemId: (transfer) => transfer.id,
    // A transfer created offline shows with version 0: the server has not seen it.
    queuedItem: (entry) => ({
      id: entry.entityId,
      groupId: entry.payload.groupId,
      fromAccountId: entry.payload.fromAccountId,
      toAccountId: entry.payload.toAccountId,
      sentAmount: entry.payload.sentAmount,
      ...queuedReceived(entry.payload),
      memo: entry.payload.memo,
      date: entry.payload.date,
      version: 0,
      changeSequence: "0",
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: entry.queuedAt,
      updatedAt: entry.queuedAt,
      deletedAt: null,
    }),
    applyEdit: (transfer, entry) => ({
      ...transfer,
      fromAccountId: entry.payload.fromAccountId,
      toAccountId: entry.payload.toAccountId,
      sentAmount: entry.payload.sentAmount,
      ...queuedReceived(entry.payload, transfer),
      memo: entry.payload.memo,
      date: entry.payload.date,
    }),
    inScope: (entry, groupId) => entry.payload.groupId === groupId,
  })
}

/** What the transfers dependencies need of the running layer. */
export interface TransfersLayer {
  copy: Pick<DeviceCopy, "pull" | "drop">
  transfersCache: TransfersCache
  transfers: TransfersCollection
}

/**
 * Puts the device's copy and the queue behind the transfers store's dependencies, as
 * `offlineTransactions` does: a read pulls what changed and answers from the copy with the queued
 * writes applied; a write is queued and sent at once when the server is reachable. A restore needs
 * the server; Undo of a delete still on the device takes it back from the queue. `accountCurrency`
 * names an account's currency for the row a queued transfer shows as. Without a running layer
 * every call goes to `online` untouched.
 */
export function offlineTransfers(
  online: TransfersDependencies,
  current: () => TransfersLayer | null,
  accountCurrency: (accountId: string) => string | undefined,
): TransfersDependencies {
  async function visible(layer: TransfersLayer, groupId: string): Promise<TransferItem[]> {
    const base = await layer.transfersCache.readTransfers(groupId)
    return await layer.transfers.overlay(base, groupId)
  }

  async function answer(
    layer: TransfersLayer,
    outcome: Awaited<ReturnType<TransfersCollection["outbox"]["submit"]>>,
    groupId: string,
    id: string,
  ): Promise<{ transfer: TransferItem }> {
    if (outcome.kind === "failed") throw outcome.error
    const transfer = (await visible(layer, groupId)).find((item) => item.id === id)
    if (!transfer) throw new Error("The transfer is not in the local store")
    return { transfer }
  }

  function payloadOf(groupId: string, fields: TransferFields): TransferPayload {
    return {
      groupId,
      fromAccountId: fields.fromAccountId,
      toAccountId: fields.toAccountId,
      sentAmount: fields.sentAmount,
      receivedAmount: fields.receivedAmount ?? null,
      memo: fields.memo,
      date: fields.date,
      fromCurrency: accountCurrency(fields.fromAccountId) ?? ``,
      toCurrency: accountCurrency(fields.toAccountId) ?? ``,
    }
  }

  return {
    ...online,
    async fetchList(groupId) {
      const layer = current()
      if (!layer) return await online.fetchList(groupId)
      await pullOrKeep(layer, groupId)
      return await visible(layer, groupId)
    },
    async create({ groupId, id, ...fields }) {
      const layer = current()
      if (!layer) return await online.create({ groupId, id, ...fields })
      const outcome = await layer.transfers.outbox.submit({
        kind: "create",
        entityId: id,
        payload: payloadOf(groupId, fields),
      })
      return await answer(layer, outcome, groupId, id)
    },
    async update({ groupId, id, version, ...fields }) {
      const layer = current()
      if (!layer) return await online.update({ groupId, id, version, ...fields })
      const outcome = await layer.transfers.outbox.submit({
        kind: "update",
        entityId: id,
        payload: payloadOf(groupId, fields),
        version,
      })
      return await answer(layer, outcome, groupId, id)
    },
    async delete(input) {
      const layer = current()
      if (!layer) return await online.delete(input)
      const known = (await visible(layer, input.groupId)).find((item) => item.id === input.id)
      const outcome = await layer.transfers.outbox.submit({
        kind: "delete",
        entityId: input.id,
        payload: {
          groupId: input.groupId,
          fromAccountId: known?.fromAccountId ?? ``,
          toAccountId: known?.toAccountId ?? ``,
          sentAmount: known?.sentAmount ?? 0,
          receivedAmount: null,
          memo: known?.memo ?? ``,
          date: known?.date ?? ``,
          // The conflict screen shows the deleted transfer's amount in its currency.
          fromCurrency: known ? accountCurrency(known.fromAccountId) ?? `` : ``,
          toCurrency: known ? accountCurrency(known.toAccountId) ?? `` : ``,
        },
        version: input.version,
      })
      if (outcome.kind === "failed") throw outcome.error
    },
    async restore(input) {
      const layer = current()
      // Undo of a delete that has not left the device takes the queued delete back.
      if (layer && await layer.transfers.outbox.withdraw(input.id)) {
        const transfer = (await visible(layer, input.groupId)).find((t) => t.id === input.id)
        if (transfer) return { transfer }
      }
      const result = await online.restore(input)
      if (layer) await layer.transfersCache.putTransfer(result.transfer)
      return result
    },
  }
}

export type { TransferEntry }
