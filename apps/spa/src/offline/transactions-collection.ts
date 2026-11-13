import {
  classifyByCode,
  type Collection,
  type CollectionDefinition,
  defineCollection,
} from "@spy4x/realtime/collections"
import type { OutboxStore } from "@spy4x/realtime/outbox"
import { TransactionKind } from "@domain/transactions"
import type { TransactionItem, TransactionsDependencies } from "../state/transactions.ts"
import {
  type TransactionEntry,
  type TransactionPayload,
  type TransactionsCache,
  transactionsQueueDatabase,
} from "./transactions-cache.ts"
import { type DeviceCopy, pullOrKeep } from "./device-copy.ts"

/**
 * The entries adapter: what is the entries' own about being offline-writable (ADR 003, level 3),
 * as `notes-collection.ts` is for notes. The accounts and categories an entry names are level 2:
 * they are never queued, so an entry depends on no other queue. A queued entry whose account or
 * category is gone by the time it is sent is the library's ordinary refusal.
 */

/** The collection's name in the queue. */
export const TRANSACTIONS_COLLECTION = "transactions"

/** The entries as a collection: an entry is the entity and the row, what was typed the payload. */
export type TransactionsCollection = Collection<
  TransactionPayload,
  TransactionItem,
  TransactionItem
>

/** What {@link transactionsCollection} is built from. */
export interface TransactionsCollectionOptions {
  /** The queue's owner: the database is named for them, and a queued entry is shown as theirs. */
  userId: number
  /** The device's copy of the entries, kept in step with the server's answers. */
  cache: TransactionsCache
  /** A queue to use instead of IndexedDB: the tests, which have none. */
  store?: OutboxStore<TransactionPayload, TransactionItem>
}

/** Reads a failed entry call: unreachable (try later) or the server's refusal and its code. */
export const classifyTransactionError = classifyByCode({
  version: "VERSION_CONFLICT",
  notFound: "TRANSACTION_NOT_FOUND",
  alreadyExists: "ID_ALREADY_EXISTS",
})

/**
 * The amounts a queued entry shows with before the server answers. In the account's own currency
 * both are the same; with a stated account amount that one is used; otherwise the server converts
 * later, so the entry shows as converted with no account amount yet (`0`), or with the one it had
 * when nothing that decides it changed.
 */
export function queuedAmounts(
  payload: TransactionPayload,
  previous?: TransactionItem,
): Pick<TransactionItem, "amount" | "accountAmount" | "converted"> {
  const sign = payload.kind === TransactionKind.EXPENSE ? -1 : 1
  const amount = sign * payload.amount
  if (payload.currency === payload.accountCurrency) {
    return { amount, accountAmount: amount, converted: false }
  }
  if (payload.accountAmount !== null) {
    return { amount, accountAmount: sign * payload.accountAmount, converted: false }
  }
  const unchanged = previous && previous.accountId === payload.accountId &&
    Math.abs(previous.amount) === payload.amount && previous.currency === payload.currency &&
    previous.date === payload.date
  return {
    amount,
    accountAmount: unchanged ? sign * Math.abs(previous.accountAmount) : 0,
    converted: true,
  }
}

/**
 * The entries of one user as an offline-writable collection, queued in
 * `offline:user:<id>:transactions-outbox`.
 */
export function transactionsCollection(
  { userId, cache, store }: TransactionsCollectionOptions,
): CollectionDefinition<TransactionPayload, TransactionItem, TransactionItem> {
  return defineCollection<TransactionPayload, TransactionItem, TransactionItem>({
    name: TRANSACTIONS_COLLECTION,
    database: transactionsQueueDatabase(userId),
    store,
    toCall({ kind, entityId, payload, baseVersion }) {
      const base = { groupId: payload.groupId, id: entityId }
      if (kind === "delete") {
        return { name: "transaction.delete", payload: { ...base, version: baseVersion } }
      }
      // The account's currency is the device's own note; the server reads it from the account.
      const fields = {
        accountId: payload.accountId,
        categoryId: payload.categoryId,
        kind: payload.kind,
        amount: payload.amount,
        currency: payload.currency,
        ...(payload.accountAmount === null ? {} : { accountAmount: payload.accountAmount }),
        memo: payload.memo,
        date: payload.date,
      }
      return kind === "create"
        ? { name: "transaction.create", payload: { ...base, ...fields } }
        : { name: "transaction.update", payload: { ...base, ...fields, version: baseVersion } }
    },
    toQuery: (id, payload) => ({
      name: "transaction.get",
      payload: { groupId: payload.groupId, id },
    }),
    entityFrom: (answer) => (answer as { transaction?: TransactionItem } | undefined)?.transaction,
    classify: classifyTransactionError,
    // Keys of the `app` catalog, shown by `OfflineStatus` in the person's language at that time. A
    // refusal that carries the server's own words (no rate for the date, a category gone) keeps
    // those instead of `rejected`.
    messages: {
      version: `TransactionSync.version`,
      gone: `TransactionSync.gone`,
      rejected: `TransactionSync.rejected`,
    },
    cache: {
      put: (transaction) => cache.putTransaction(transaction),
      remove: (transactionId) => cache.removeTransaction(transactionId),
    },
    itemId: (transaction) => transaction.id,
    // An entry created offline shows with version 0: the server has not seen it.
    queuedItem: (entry) => ({
      id: entry.entityId,
      groupId: entry.payload.groupId,
      accountId: entry.payload.accountId,
      categoryId: entry.payload.categoryId,
      kind: entry.payload.kind,
      ...queuedAmounts(entry.payload),
      currency: entry.payload.currency,
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
    applyEdit: (transaction, entry) => ({
      ...transaction,
      accountId: entry.payload.accountId,
      categoryId: entry.payload.categoryId,
      kind: entry.payload.kind,
      ...queuedAmounts(entry.payload, transaction),
      currency: entry.payload.currency,
      memo: entry.payload.memo,
      date: entry.payload.date,
    }),
    inScope: (entry, groupId) => entry.payload.groupId === groupId,
  })
}

/** What the entries dependencies need of the running layer. */
export interface TransactionsLayer {
  copy: Pick<DeviceCopy, "pull" | "drop">
  transactionsCache: TransactionsCache
  transactions: TransactionsCollection
}

/**
 * Puts the device's copy and the queue behind the transactions store's dependencies, as
 * `offlineNotes` does: a read pulls what changed and answers from the copy with the queued writes
 * applied; a write is queued and sent at once when the server is reachable. The deleted list and
 * a restore need the server; Undo of a delete still on the device takes it back from the queue.
 * Without a running layer every call goes to `online` untouched.
 */
export function offlineTransactions(
  online: TransactionsDependencies,
  current: () => TransactionsLayer | null,
): TransactionsDependencies {
  async function visible(layer: TransactionsLayer, groupId: string): Promise<TransactionItem[]> {
    const base = await layer.transactionsCache.readTransactions(groupId)
    return await layer.transactions.overlay(base, groupId)
  }

  async function answer(
    layer: TransactionsLayer,
    outcome: Awaited<ReturnType<TransactionsCollection["outbox"]["submit"]>>,
    groupId: string,
    id: string,
  ): Promise<{ transaction: TransactionItem }> {
    if (outcome.kind === "failed") throw outcome.error
    const transaction = (await visible(layer, groupId)).find((entry) => entry.id === id)
    if (!transaction) throw new Error("The transaction is not in the local store")
    return { transaction }
  }

  function payloadOf(
    input: Parameters<TransactionsDependencies["create"]>[0],
  ): TransactionPayload {
    return {
      groupId: input.groupId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency,
      accountAmount: input.accountAmount ?? null,
      memo: input.memo,
      date: input.date,
      accountCurrency: input.accountCurrency,
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
    async create(input) {
      const layer = current()
      if (!layer) return await online.create(input)
      const outcome = await layer.transactions.outbox.submit({
        kind: "create",
        entityId: input.id,
        payload: payloadOf(input),
      })
      return await answer(layer, outcome, input.groupId, input.id)
    },
    async update(input) {
      const layer = current()
      if (!layer) return await online.update(input)
      const outcome = await layer.transactions.outbox.submit({
        kind: "update",
        entityId: input.id,
        payload: payloadOf(input),
        version: input.version,
      })
      return await answer(layer, outcome, input.groupId, input.id)
    },
    async delete(input) {
      const layer = current()
      if (!layer) return await online.delete(input)
      const known = (await visible(layer, input.groupId)).find((entry) => entry.id === input.id)
      const outcome = await layer.transactions.outbox.submit({
        kind: "delete",
        entityId: input.id,
        payload: {
          groupId: input.groupId,
          accountId: known?.accountId ?? "",
          categoryId: known?.categoryId ?? "",
          kind: known?.kind ?? TransactionKind.EXPENSE,
          amount: Math.abs(known?.amount ?? 0),
          currency: known?.currency ?? "",
          accountAmount: null,
          memo: known?.memo ?? "",
          date: known?.date ?? "",
          accountCurrency: "",
        },
        version: input.version,
      })
      if (outcome.kind === "failed") throw outcome.error
    },
    async restore(input) {
      const layer = current()
      // Undo of a delete that has not left the device takes the queued delete back.
      if (layer && await layer.transactions.outbox.withdraw(input.id)) {
        const transaction = (await visible(layer, input.groupId)).find((e) => e.id === input.id)
        if (transaction) return { transaction }
      }
      const result = await online.restore(input)
      if (layer) await layer.transactionsCache.putTransaction(result.transaction)
      return result
    },
  }
}

export type { TransactionEntry }
