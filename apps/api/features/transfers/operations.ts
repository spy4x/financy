import {
  parseTransferRequest,
  type Transfer,
  TransferCreateCommand,
  transferCreatePayloadSchema,
  TransferDeleteCommand,
  transferDeletePayloadSchema,
  transferGetPayloadSchema,
  TransferGetQuery,
  TransferRestoreCommand,
  transferRestorePayloadSchema,
  TransferUpdateCommand,
  transferUpdatePayloadSchema,
  type TransferWriteResult,
} from "@domain/transfers"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the transfer requests need from the app: the buses. */
export interface TransferOperationDependencies {
  create(command: TransferCreateCommand): Promise<TransferWriteResult>
  update(command: TransferUpdateCommand): Promise<{ transfer: Transfer }>
  delete(command: TransferDeleteCommand): Promise<{ transfer: Transfer }>
  restore(command: TransferRestoreCommand): Promise<{ transfer: Transfer }>
  get(query: TransferGetQuery): Promise<{ transfer: Transfer }>
}

/**
 * The transfer commands and queries, listed once. The socket and `POST /api/call/<name>` both
 * serve this list, so a transfer has no REST route. Each one parses its payload and dispatches on
 * the bus; who may do what is decided in the handlers. Not to be confused with `group.transfer`,
 * which hands a group to another owner.
 */
export function createTransferOperations(
  dependencies: TransferOperationDependencies,
): Operations<Actor> {
  return {
    "transfer.create": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransferRequest(transferCreatePayloadSchema, payload)
        return await dependencies.create(
          new TransferCreateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transfer.update": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransferRequest(transferUpdatePayloadSchema, payload)
        return await dependencies.update(
          new TransferUpdateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transfer.delete": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransferRequest(transferDeletePayloadSchema, payload)
        return await dependencies.delete(
          new TransferDeleteCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transfer.restore": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransferRequest(transferRestorePayloadSchema, payload)
        return await dependencies.restore(
          new TransferRestoreCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transfer.get": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseTransferRequest(transferGetPayloadSchema, payload)
        return await dependencies.get(new TransferGetQuery({ actor, ...input }))
      },
    },
  }
}
