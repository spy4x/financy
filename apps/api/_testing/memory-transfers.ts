import { assertRoomFor } from "@domain/billing"
import type { GroupRole } from "@domain/groups"
import type { EntryRateLookup } from "@domain/transactions"
import {
  assertCanWriteTransfers,
  assertTransferReferences,
  deriveTransferAmounts,
  type Transfer,
  type TransferCreateInput,
  type TransferDeleteInput,
  TransferError,
  type TransferFields,
  type TransferRepository,
  type TransferRestoreInput,
  type TransferUpdateInput,
  TransferVersionConflictError,
  type TransferWriteResult,
} from "@domain/transfers"

const AT = new Date("2026-11-02T10:00:00.000Z")

/** What the twin knows of the households: accounts by id, time zones, rates and members' roles. */
export interface MemoryTransferWorld {
  accounts: Map<string, { groupId: string; currency: string; deleted?: boolean }>
  /** Each household's time zone; one missing is UTC. */
  timeZones: Map<string, string>
  rates: EntryRateLookup
  /**
   * The actor's role as it stands when the write runs, read again like the Postgres repository's
   * `lockActorRole`, so a removal that lands after the handler's check still refuses the write.
   */
  roleOf: (groupId: string, userId: number) => Promise<GroupRole | null>
}

/**
 * Transfers in memory, with the Postgres repository's rules: the role is read again at the write,
 * both accounts are looked up inside the household, the stored amounts come from the same
 * {@link deriveTransferAmounts}, a retried create gets its first transfer back, and a write at
 * another version is refused with the current one. Balances, the composite keys and the lock
 * itself need Postgres; `tests/integration/` holds them.
 */
export class MemoryTransferRepository implements TransferRepository {
  readonly transfers = new Map<string, Transfer>()
  writes = 0
  #sequence = 1

  constructor(readonly world: MemoryTransferWorld) {}

  get(groupId: string, id: string): Promise<Transfer | null> {
    const transfer = this.#find(groupId, id)
    return Promise.resolve(transfer && transfer.deletedAt === null ? transfer : null)
  }

  count(groupId: string): Promise<number> {
    return Promise.resolve(
      [...this.transfers.values()].filter((transfer) =>
        transfer.groupId === groupId && transfer.deletedAt === null
      ).length,
    )
  }

  timeZoneOf(groupId: string): Promise<string | null> {
    return Promise.resolve(this.world.timeZones.get(groupId) ?? "UTC")
  }

  async create(input: TransferCreateInput, actorId: number): Promise<TransferWriteResult> {
    const role = await this.#writer(input.groupId, actorId)
    const existing = this.transfers.get(input.id)
    if (existing) {
      const same = existing.groupId === input.groupId && existing.createdByUserId === actorId &&
        existing.deletedAt === null && existing.fromAccountId === input.fromAccountId &&
        existing.toAccountId === input.toAccountId && existing.sentAmount === input.sentAmount &&
        existing.memo === input.memo && existing.date === input.date &&
        (input.receivedAmount === undefined || existing.receivedAmount === input.receivedAmount)
      if (same) return { transfer: existing, created: false }
      throw new TransferError("ID_ALREADY_EXISTS", "taken")
    }
    const amounts = await this.#amounts(input, null)
    if (input.allowance !== null) {
      assertRoomFor("maxTransactions", input.allowance, await this.count(input.groupId), role)
    }
    const transfer: Transfer = {
      id: input.id,
      groupId: input.groupId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      ...amounts,
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
    this.transfers.set(transfer.id, transfer)
    this.writes++
    return { transfer, created: true }
  }

  async update(input: TransferUpdateInput, actorId: number): Promise<Transfer> {
    await this.#writer(input.groupId, actorId)
    const current = this.#live(input.groupId, input.id, input.expectedVersion)
    const amounts = await this.#amounts(input, current)
    return this.#write({
      ...current,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      ...amounts,
      memo: input.memo,
      date: input.date,
      updatedByUserId: actorId,
    })
  }

  async delete(input: TransferDeleteInput, actorId: number): Promise<Transfer> {
    await this.#writer(input.groupId, actorId)
    const current = this.#live(input.groupId, input.id, input.expectedVersion)
    return this.#write({ ...current, deletedAt: AT, updatedByUserId: actorId })
  }

  async restore(input: TransferRestoreInput, actorId: number): Promise<Transfer> {
    const role = await this.#writer(input.groupId, actorId)
    const current = this.#find(input.groupId, input.id)
    if (!current || current.deletedAt === null) {
      throw new TransferError("TRANSFER_NOT_FOUND", "Transfer not found")
    }
    if (input.allowance !== null) {
      assertRoomFor("maxTransactions", input.allowance, await this.count(input.groupId), role)
    }
    return this.#write({ ...current, deletedAt: null, updatedByUserId: actorId })
  }

  async #writer(groupId: string, actorId: number): Promise<GroupRole> {
    const role = await this.world.roleOf(groupId, actorId)
    assertCanWriteTransfers(role)
    return role!
  }

  async #amounts(input: TransferFields & { groupId: string }, previous: Transfer | null) {
    const account = (id: string) => {
      const found = this.world.accounts.get(id)
      return found && found.groupId === input.groupId && !found.deleted
        ? { currency: found.currency }
        : null
    }
    const references = { from: account(input.fromAccountId), to: account(input.toAccountId) }
    assertTransferReferences(input, references)
    return await deriveTransferAmounts(
      input,
      references.from.currency,
      references.to.currency,
      previous,
      this.world.rates,
    )
  }

  #find(groupId: string, id: string): Transfer | null {
    const transfer = this.transfers.get(id)
    return transfer && transfer.groupId === groupId ? transfer : null
  }

  #live(groupId: string, id: string, version: number): Transfer {
    const current = this.#find(groupId, id)
    if (!current || current.deletedAt !== null) {
      throw new TransferError("TRANSFER_NOT_FOUND", "Transfer not found")
    }
    if (current.version !== version) throw new TransferVersionConflictError(current.version)
    return current
  }

  #write(transfer: Transfer): Transfer {
    const written = {
      ...transfer,
      version: transfer.version + 1,
      changeSequence: String(this.#sequence++),
      updatedAt: AT,
    }
    this.transfers.set(written.id, written)
    this.writes++
    return written
  }
}
