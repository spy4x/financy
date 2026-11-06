import {
  type Account,
  type AccountArchiveInput,
  type AccountCreateInput,
  type AccountDeleteInput,
  AccountError,
  type AccountRepository,
  type AccountRestoreInput,
  type AccountSetDefaultInput,
  type AccountUpdateInput,
  AccountVersionConflictError,
  type AccountWriteResult,
  assertAccountRoom,
  type ListedAccount,
} from "@domain/accounts"

const AT = new Date("2026-11-02T10:00:00.000Z")

/**
 * Accounts in memory, with the Postgres repository's rules: an id is looked up inside its group, a
 * household holds at most `ACCOUNT_MAX_PER_GROUP` live accounts, a write at another version is
 * refused with the current one, one account is the default, and archiving or deleting the default
 * clears it. The balance is the starting balance, as it is until transactions exist.
 */
export class MemoryAccountRepository implements AccountRepository {
  readonly accounts = new Map<string, Account>()
  writes = 0
  #sequence = 1

  list(groupId: string, deleted = false): Promise<ListedAccount[]> {
    return Promise.resolve(
      [...this.accounts.values()]
        .filter((account) =>
          account.groupId === groupId && (account.deletedAt !== null) === deleted
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(listed),
    )
  }

  get(groupId: string, id: string): Promise<ListedAccount | null> {
    const account = this.accounts.get(id)
    return Promise.resolve(
      account && account.groupId === groupId && !account.deletedAt ? listed(account) : null,
    )
  }

  create(input: AccountCreateInput, actorId: number): Promise<AccountWriteResult> {
    const existing = this.accounts.get(input.id)
    if (existing) {
      const same = existing.groupId === input.groupId && existing.name === input.name &&
        existing.kind === input.kind && existing.currency === input.currency &&
        existing.startingBalance === input.startingBalance && existing.createdByUserId === actorId
      if (same) return Promise.resolve({ account: existing, created: false })
      throw new AccountError("ID_ALREADY_EXISTS", "taken")
    }
    assertAccountRoom(this.#live(input.groupId) + 1)
    const account: Account = {
      id: input.id,
      groupId: input.groupId,
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      startingBalance: input.startingBalance,
      archivedAt: null,
      isDefault: false,
      version: 1,
      changeSequence: String(this.#sequence++),
      createdByUserId: actorId,
      updatedByUserId: actorId,
      createdAt: AT,
      updatedAt: AT,
      deletedAt: null,
    }
    return Promise.resolve({ account: this.#save(account), created: true })
  }

  update(input: AccountUpdateInput, actorId: number): Promise<Account> {
    const account = this.#current(input.groupId, input.id, input.expectedVersion)
    return Promise.resolve(this.#save({
      ...this.#bump(account, actorId),
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      startingBalance: input.startingBalance,
    }))
  }

  archive(input: AccountArchiveInput, actorId: number): Promise<Account> {
    const account = this.#current(input.groupId, input.id, input.expectedVersion)
    return Promise.resolve(this.#save({
      ...this.#bump(account, actorId),
      archivedAt: input.archived ? account.archivedAt ?? AT : null,
      isDefault: input.archived ? false : account.isDefault,
    }))
  }

  setDefault(input: AccountSetDefaultInput, actorId: number): Promise<Account> {
    const account = this.#current(input.groupId, input.id, input.expectedVersion)
    if (input.isDefault && account.archivedAt) {
      throw new AccountError("ACCOUNT_ARCHIVED", "An archived account cannot be the default")
    }
    if (input.isDefault) {
      for (const other of this.accounts.values()) {
        if (other.groupId === input.groupId && other.isDefault && other.id !== account.id) {
          this.#save({ ...this.#bump(other, actorId), isDefault: false })
        }
      }
    }
    return Promise.resolve(
      this.#save({ ...this.#bump(account, actorId), isDefault: input.isDefault }),
    )
  }

  delete(input: AccountDeleteInput, actorId: number): Promise<Account> {
    const account = this.#current(input.groupId, input.id, input.expectedVersion)
    return Promise.resolve(
      this.#save({ ...this.#bump(account, actorId), deletedAt: AT, isDefault: false }),
    )
  }

  restore(input: AccountRestoreInput, actorId: number): Promise<Account> {
    const account = this.accounts.get(input.id)
    if (!account || account.groupId !== input.groupId || !account.deletedAt) {
      throw new AccountError("ACCOUNT_NOT_FOUND", "Account not found")
    }
    assertAccountRoom(this.#live(input.groupId) + 1)
    return Promise.resolve(this.#save({ ...this.#bump(account, actorId), deletedAt: null }))
  }

  #live(groupId: string): number {
    return [...this.accounts.values()]
      .filter((account) => account.groupId === groupId && !account.deletedAt).length
  }

  #bump(account: Account, actorId: number): Account {
    return {
      ...account,
      version: account.version + 1,
      changeSequence: String(this.#sequence++),
      updatedByUserId: actorId,
    }
  }

  #save(account: Account): Account {
    this.accounts.set(account.id, account)
    this.writes++
    return account
  }

  #current(groupId: string, id: string, expectedVersion: number): Account {
    const account = this.accounts.get(id)
    if (!account || account.groupId !== groupId || account.deletedAt) {
      throw new AccountError("ACCOUNT_NOT_FOUND", "Account not found")
    }
    if (account.version !== expectedVersion) throw new AccountVersionConflictError(account.version)
    return account
  }
}

function listed(account: Account): ListedAccount {
  return { ...account, balance: account.startingBalance }
}
