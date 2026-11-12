import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  assertCanReadTransactions,
  assertCanWriteTransactions,
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionError,
  type TransactionFields,
  TransactionGetQuery,
  TransactionLedgerQuery,
  type TransactionRepository,
  type TransactionRequestFields,
  TransactionRestoreCommand,
  TransactionUpdateCommand,
} from "@domain/transactions"
import { groupTimeZone } from "@domain/groups"
import type { HouseholdSettings } from "@domain/money"
import type { GroupRoleLookup } from "@domain/notes"
import { isoDateInTz } from "@spy4x/time/tz"

/**
 * What every entry handler needs: the entries, the actor's role in the household, and the clock
 * that says what "today" is when an entry comes without a date.
 */
export interface TransactionHandlerDependencies {
  transactions: TransactionRepository
  groups: GroupRoleLookup
  /** The current instant; a test passes a fixed one. */
  now: () => Date
}

/** What the ledger reads besides the entries: the household's base currency. */
export interface TransactionLedgerDependencies extends TransactionHandlerDependencies {
  settings: { get(groupId: string): Promise<Pick<HouseholdSettings, "baseCurrency">> }
}

/**
 * Throws unless the entitlement gate set the plan's cap on the command: a bus without the gate
 * would add entries to a household that has no plan, so it fails closed.
 */
function assertGated(
  allowance: number | null | undefined,
  command: string,
): asserts allowance is number | null {
  if (allowance === undefined) {
    throw new Error(`${command} reached its handler without the entitlement gate`)
  }
}

/**
 * The fields a write stores, with the server's defaults: no memo is an empty one, and no date is
 * today in the household's time zone (R14), so a member in Berlin and one in Singapore file a
 * 23:30 expense on the same day.
 */
async function entryFields(
  { transactions, now }: TransactionHandlerDependencies,
  groupId: string,
  data: TransactionRequestFields,
): Promise<TransactionFields> {
  const date = data.date ??
    isoDateInTz(now(), groupTimeZone({ timeZone: await transactions.timeZoneOf(groupId) }))
  return {
    accountId: data.accountId,
    categoryId: data.categoryId,
    kind: data.kind,
    amount: data.amount,
    currency: data.currency,
    ...(data.accountAmount !== undefined && { accountAmount: data.accountAmount }),
    memo: data.memo ?? "",
    date,
  }
}

/**
 * The entry handlers. Each one decides who may act before it touches an entry: every member reads,
 * an editor or above writes, and a stranger is told the household does not exist. The repository
 * checks the role again inside each write's transaction, so a write that races a removal or a
 * demotion is refused too. Session strength is checked earlier, by the session gate.
 */
export function createTransactionCreateHandler(
  dependencies: TransactionHandlerDependencies,
): CommandHandler<TransactionCreateCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "TransactionCreateCommand")
    assertCanWriteTransactions(await dependencies.groups.roleOf(data.groupId, data.actor.userId))
    return await dependencies.transactions.create(
      {
        allowance,
        groupId: data.groupId,
        id: data.id,
        requestId: data.requestId,
        ...await entryFields(dependencies, data.groupId, data),
      },
      data.actor.userId,
    )
  }
}

export function createTransactionUpdateHandler(
  dependencies: TransactionHandlerDependencies,
): CommandHandler<TransactionUpdateCommand> {
  return async ({ data }) => {
    assertCanWriteTransactions(await dependencies.groups.roleOf(data.groupId, data.actor.userId))
    const transaction = await dependencies.transactions.update(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
        ...await entryFields(dependencies, data.groupId, data),
      },
      data.actor.userId,
    )
    return { transaction }
  }
}

export function createTransactionDeleteHandler(
  { transactions, groups }: TransactionHandlerDependencies,
): CommandHandler<TransactionDeleteCommand> {
  return async ({ data }) => {
    assertCanWriteTransactions(await groups.roleOf(data.groupId, data.actor.userId))
    const transaction = await transactions.delete(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { transaction }
  }
}

export function createTransactionRestoreHandler(
  { transactions, groups }: TransactionHandlerDependencies,
): CommandHandler<TransactionRestoreCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "TransactionRestoreCommand")
    assertCanWriteTransactions(await groups.roleOf(data.groupId, data.actor.userId))
    const transaction = await transactions.restore(
      { allowance, groupId: data.groupId, id: data.id, requestId: data.requestId },
      data.actor.userId,
    )
    return { transaction }
  }
}

export function createTransactionGetHandler(
  { transactions, groups }: TransactionHandlerDependencies,
): QueryHandler<TransactionGetQuery> {
  return async ({ data }) => {
    assertCanReadTransactions(await groups.roleOf(data.groupId, data.actor.userId))
    const transaction = await transactions.get(data.groupId, data.id)
    if (!transaction) throw new TransactionError("TRANSACTION_NOT_FOUND", "Transaction not found")
    return { transaction }
  }
}

/** The household's income, spending per category and net for a period, in its base currency. */
export function createTransactionLedgerHandler(
  { transactions, groups, settings }: TransactionLedgerDependencies,
): QueryHandler<TransactionLedgerQuery> {
  return async ({ data }) => {
    assertCanReadTransactions(await groups.roleOf(data.groupId, data.actor.userId))
    const { baseCurrency } = await settings.get(data.groupId)
    return { ledger: await transactions.ledger(data.groupId, baseCurrency, data.from, data.to) }
  }
}
