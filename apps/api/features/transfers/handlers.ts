import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  assertCanReadTransfers,
  assertCanWriteTransfers,
  TransferCreateCommand,
  TransferDeleteCommand,
  TransferError,
  type TransferFields,
  TransferGetQuery,
  type TransferRepository,
  type TransferRequestFields,
  TransferRestoreCommand,
  TransferUpdateCommand,
} from "@domain/transfers"
import { groupTimeZone } from "@domain/groups"
import type { GroupRoleLookup } from "@domain/notes"
import { isoDateInTz } from "@spy4x/time/tz"

/**
 * What every transfer handler needs: the transfers, the actor's role in the household, and the
 * clock that says what "today" is when a transfer comes without a date.
 */
export interface TransferHandlerDependencies {
  transfers: TransferRepository
  groups: GroupRoleLookup
  /** The current instant; a test passes a fixed one. */
  now: () => Date
}

/**
 * Throws unless the entitlement gate set the plan's cap on the command: a bus without the gate
 * would add transfers to a household that has no plan, so it fails closed.
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
 * The fields a write stores, picked by name so nothing else a command carries reaches the
 * repository, with the server's defaults: no memo is an empty one, and no date is today in the
 * household's time zone (R14).
 */
async function transferFields(
  { transfers, now }: TransferHandlerDependencies,
  groupId: string,
  data: TransferRequestFields,
): Promise<TransferFields> {
  const date = data.date ??
    isoDateInTz(now(), groupTimeZone({ timeZone: await transfers.timeZoneOf(groupId) }))
  return {
    fromAccountId: data.fromAccountId,
    toAccountId: data.toAccountId,
    sentAmount: data.sentAmount,
    ...(data.receivedAmount !== undefined && { receivedAmount: data.receivedAmount }),
    memo: data.memo ?? "",
    date,
  }
}

/**
 * The transfer handlers. Each one decides who may act before it touches a transfer: every member
 * reads, an editor or above writes, and a stranger is told the household does not exist. The
 * repository checks the role again inside each write's transaction, so a write that races a
 * removal or a demotion is refused too. Session strength is checked earlier, by the session gate.
 */
export function createTransferCreateHandler(
  dependencies: TransferHandlerDependencies,
): CommandHandler<TransferCreateCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "TransferCreateCommand")
    assertCanWriteTransfers(await dependencies.groups.roleOf(data.groupId, data.actor.userId))
    return await dependencies.transfers.create(
      {
        allowance,
        groupId: data.groupId,
        id: data.id,
        requestId: data.requestId,
        ...await transferFields(dependencies, data.groupId, data),
      },
      data.actor.userId,
    )
  }
}

export function createTransferUpdateHandler(
  dependencies: TransferHandlerDependencies,
): CommandHandler<TransferUpdateCommand> {
  return async ({ data }) => {
    assertCanWriteTransfers(await dependencies.groups.roleOf(data.groupId, data.actor.userId))
    // An edit names every field (the schema requires the memo and the date), so no default fills
    // what it does not name.
    const transfer = await dependencies.transfers.update(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
        ...await transferFields(dependencies, data.groupId, data),
      },
      data.actor.userId,
    )
    return { transfer }
  }
}

export function createTransferDeleteHandler(
  { transfers, groups }: TransferHandlerDependencies,
): CommandHandler<TransferDeleteCommand> {
  return async ({ data }) => {
    assertCanWriteTransfers(await groups.roleOf(data.groupId, data.actor.userId))
    const transfer = await transfers.delete(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { transfer }
  }
}

export function createTransferRestoreHandler(
  { transfers, groups }: TransferHandlerDependencies,
): CommandHandler<TransferRestoreCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "TransferRestoreCommand")
    assertCanWriteTransfers(await groups.roleOf(data.groupId, data.actor.userId))
    const transfer = await transfers.restore(
      { allowance, groupId: data.groupId, id: data.id, requestId: data.requestId },
      data.actor.userId,
    )
    return { transfer }
  }
}

export function createTransferGetHandler(
  { transfers, groups }: TransferHandlerDependencies,
): QueryHandler<TransferGetQuery> {
  return async ({ data }) => {
    assertCanReadTransfers(await groups.roleOf(data.groupId, data.actor.userId))
    const transfer = await transfers.get(data.groupId, data.id)
    if (!transfer) throw new TransferError("TRANSFER_NOT_FOUND", "Transfer not found")
    return { transfer }
  }
}
