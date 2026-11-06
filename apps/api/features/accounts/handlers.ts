import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  AccountArchiveCommand,
  AccountCreateCommand,
  AccountDeleteCommand,
  AccountError,
  AccountGetQuery,
  AccountListQuery,
  type AccountRepository,
  AccountRestoreCommand,
  AccountSetDefaultCommand,
  AccountUpdateCommand,
  assertCanReadAccounts,
  assertCanWriteAccounts,
} from "@domain/accounts"
import type { GroupRoleLookup } from "@domain/notes"

/** What every account handler needs: the accounts, and the actor's role in the household. */
export interface AccountHandlerDependencies {
  accounts: AccountRepository
  groups: GroupRoleLookup
}

/**
 * The account handlers. Each one decides who may act before it touches an account: every member
 * reads, an editor or above writes, and a stranger is told the household does not exist. The
 * repository checks the role again inside each write's transaction, so a write that races a
 * removal or a demotion is refused too. Session strength is checked earlier, by the session gate.
 */
export function createAccountCreateHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountCreateCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    return await accounts.create(
      {
        groupId: data.groupId,
        id: data.id,
        name: data.name,
        kind: data.kind,
        currency: data.currency,
        startingBalance: data.startingBalance,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
  }
}

export function createAccountUpdateHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountUpdateCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.update(
      {
        groupId: data.groupId,
        id: data.id,
        name: data.name,
        kind: data.kind,
        currency: data.currency,
        startingBalance: data.startingBalance,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountArchiveHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountArchiveCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.archive(
      {
        groupId: data.groupId,
        id: data.id,
        archived: data.archived,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountSetDefaultHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountSetDefaultCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.setDefault(
      {
        groupId: data.groupId,
        id: data.id,
        isDefault: data.isDefault,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountDeleteHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountDeleteCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.delete(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountRestoreHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountRestoreCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.restore(
      { groupId: data.groupId, id: data.id, requestId: data.requestId },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountListHandler(
  { accounts, groups }: AccountHandlerDependencies,
): QueryHandler<AccountListQuery> {
  return async ({ data }) => {
    assertCanReadAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    return { accounts: await accounts.list(data.groupId, data.deleted ?? false) }
  }
}

export function createAccountGetHandler(
  { accounts, groups }: AccountHandlerDependencies,
): QueryHandler<AccountGetQuery> {
  return async ({ data }) => {
    assertCanReadAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.get(data.groupId, data.id)
    if (!account) throw new AccountError("ACCOUNT_NOT_FOUND", "Account not found")
    return { account }
  }
}
