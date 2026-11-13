import type { CategoryKind } from "@domain/categories"
import { assertRoomFor } from "@domain/billing"
import { GroupRole } from "@domain/groups"
import {
  assertEntryReferences,
  deriveAmounts,
  type EntryRateLookup,
  type Ledger,
  type LedgerRow,
  summarizeLedger,
  summarizeLedgerMonths,
  type Transaction,
  type TransactionCreateInput,
  type TransactionDeleteInput,
  TransactionError,
  type TransactionRepository,
  type TransactionRestoreInput,
  type TransactionUpdateInput,
  TransactionVersionConflictError,
  type TransactionWriteResult,
} from "@domain/transactions"

const AT = new Date("2026-11-02T10:00:00.000Z")

/** What the twin knows of a household's accounts and categories, keyed by id. */
export interface MemoryEntryReferences {
  accounts: Map<string, { groupId: string; currency: string; deleted?: boolean }>
  categories: Map<string, { groupId: string; kind: CategoryKind; parentId?: string | null }>
  /** Each household's time zone; one missing is UTC. */
  timeZones: Map<string, string>
  rates: EntryRateLookup
}

/**
 * Entries in memory, with the Postgres repository's rules: an id, an account and a category are
 * looked up inside their group, the stored amounts come from the same {@link deriveAmounts}, and
 * a write at another version is refused with the current one. The role check under the lock and
 * the race with a removal need Postgres; the integration tests hold them.
 */
export class MemoryTransactionRepository implements TransactionRepository {
  readonly transactions = new Map<string, Transaction>()
  writes = 0
  #sequence = 1

  constructor(readonly references: MemoryEntryReferences) {}

  get(groupId: string, id: string): Promise<Transaction | null> {
    const entry = this.#find(groupId, id)
    return Promise.resolve(entry && entry.deletedAt === null ? entry : null)
  }

  listDeleted(groupId: string, limit: number): Promise<Transaction[]> {
    const deleted = [...this.transactions.values()]
      .filter((entry) => entry.groupId === groupId && entry.deletedAt !== null)
      // Every delete here is stamped at one instant, so the later write breaks the tie.
      .sort((a, b) =>
        b.deletedAt!.getTime() - a.deletedAt!.getTime() ||
        Number(b.changeSequence) - Number(a.changeSequence)
      )
    return Promise.resolve(deleted.slice(0, limit))
  }

  count(groupId: string): Promise<number> {
    return Promise.resolve(
      [...this.transactions.values()].filter((entry) =>
        entry.groupId === groupId && entry.deletedAt === null
      ).length,
    )
  }

  timeZoneOf(groupId: string): Promise<string | null> {
    return Promise.resolve(this.references.timeZones.get(groupId) ?? "UTC")
  }

  async create(input: TransactionCreateInput, actorId: number): Promise<TransactionWriteResult> {
    const existing = this.transactions.get(input.id)
    if (existing) {
      const same = existing.groupId === input.groupId && existing.createdByUserId === actorId &&
        existing.deletedAt === null && existing.accountId === input.accountId &&
        existing.categoryId === input.categoryId && existing.kind === input.kind &&
        Math.abs(existing.amount) === input.amount && existing.currency === input.currency &&
        existing.memo === input.memo && existing.date === input.date
      if (same) return { transaction: existing, created: false }
      throw new TransactionError("ID_ALREADY_EXISTS", "taken")
    }
    const references = this.#referencesOf(input)
    assertEntryReferences(input.kind, references)
    const amounts = await deriveAmounts(
      input,
      references.account.currency,
      null,
      this.references.rates,
    )
    if (input.allowance !== null) {
      assertRoomFor(
        "maxTransactions",
        input.allowance,
        await this.count(input.groupId),
        GroupRole.EDITOR,
      )
    }
    const entry: Transaction = {
      id: input.id,
      groupId: input.groupId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      kind: input.kind,
      ...amounts,
      currency: input.currency,
      memo: input.memo,
      date: input.date,
      version: 1,
      changeSequence: String(this.#sequence++),
      createdByUserId: actorId,
      updatedByUserId: actorId,
      createdAt: AT,
      updatedAt: AT,
      deletedAt: null,
    }
    this.transactions.set(entry.id, entry)
    this.writes++
    return { transaction: entry, created: true }
  }

  async update(input: TransactionUpdateInput, actorId: number): Promise<Transaction> {
    const current = this.#live(input.groupId, input.id, input.expectedVersion)
    const references = this.#referencesOf(input)
    assertEntryReferences(input.kind, references)
    const amounts = await deriveAmounts(
      input,
      references.account.currency,
      current,
      this.references.rates,
    )
    return this.#write({
      ...current,
      accountId: input.accountId,
      categoryId: input.categoryId,
      kind: input.kind,
      ...amounts,
      currency: input.currency,
      memo: input.memo,
      date: input.date,
      updatedByUserId: actorId,
    })
  }

  delete(input: TransactionDeleteInput, actorId: number): Promise<Transaction> {
    const current = this.#live(input.groupId, input.id, input.expectedVersion)
    return Promise.resolve(this.#write({ ...current, deletedAt: AT, updatedByUserId: actorId }))
  }

  async restore(input: TransactionRestoreInput, actorId: number): Promise<Transaction> {
    const current = this.#find(input.groupId, input.id)
    if (!current || current.deletedAt === null) {
      throw new TransactionError("TRANSACTION_NOT_FOUND", "Transaction not found")
    }
    if (input.allowance !== null) {
      assertRoomFor(
        "maxTransactions",
        input.allowance,
        await this.count(input.groupId),
        GroupRole.EDITOR,
      )
    }
    return this.#write({ ...current, deletedAt: null, updatedByUserId: actorId })
  }

  async ledger(groupId: string, currency: string, from: string, to: string): Promise<Ledger> {
    const { rows, categories } = this.#ledgerRows(groupId, currency, from, to)
    return await summarizeLedger(rows, categories, { currency, from, to }, this.references.rates)
  }

  async ledgerMonths(
    groupId: string,
    currency: string,
    from: string,
    to: string,
  ): Promise<Ledger[]> {
    const { rows, categories } = this.#ledgerRows(groupId, currency, from, to)
    return await summarizeLedgerMonths(
      rows,
      categories,
      { currency, from, to },
      this.references.rates,
    )
  }

  #ledgerRows(groupId: string, currency: string, from: string, to: string) {
    const rows: LedgerRow[] = [...this.transactions.values()]
      .filter((entry) =>
        entry.groupId === groupId && entry.deletedAt === null && entry.date >= from &&
        entry.date <= to
      )
      .map((entry) =>
        entry.currency === currency
          ? { categoryId: entry.categoryId, currency, date: entry.date, amount: entry.amount }
          : {
            categoryId: entry.categoryId,
            currency: this.references.accounts.get(entry.accountId)!.currency,
            date: entry.date,
            amount: entry.accountAmount,
          }
      )
    const categories = [...this.references.categories]
      .filter(([, category]) => category.groupId === groupId)
      .map(([id, category]) => ({ id, kind: category.kind, parentId: category.parentId ?? null }))
    return { rows, categories }
  }

  #find(groupId: string, id: string): Transaction | null {
    const entry = this.transactions.get(id)
    return entry && entry.groupId === groupId ? entry : null
  }

  #live(groupId: string, id: string, version: number): Transaction {
    const current = this.#find(groupId, id)
    if (!current || current.deletedAt !== null) {
      throw new TransactionError("TRANSACTION_NOT_FOUND", "Transaction not found")
    }
    if (current.version !== version) throw new TransactionVersionConflictError(current.version)
    return current
  }

  #referencesOf(input: { groupId: string; accountId: string; categoryId: string }) {
    const account = this.references.accounts.get(input.accountId)
    const category = this.references.categories.get(input.categoryId)
    return {
      account: account && account.groupId === input.groupId && !account.deleted
        ? { currency: account.currency }
        : null,
      category: category && category.groupId === input.groupId ? { kind: category.kind } : null,
    }
  }

  #write(entry: Transaction): Transaction {
    const written = {
      ...entry,
      version: entry.version + 1,
      changeSequence: String(this.#sequence++),
      updatedAt: AT,
    }
    this.transactions.set(written.id, written)
    this.writes++
    return written
  }
}
