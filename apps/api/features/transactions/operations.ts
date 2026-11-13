import {
  type Ledger,
  parseTransactionRequest,
  type Transaction,
  TransactionCreateCommand,
  transactionCreatePayloadSchema,
  TransactionDeleteCommand,
  transactionDeletePayloadSchema,
  transactionGetPayloadSchema,
  TransactionGetQuery,
  transactionLedgerPayloadSchema,
  TransactionLedgerQuery,
  transactionListDeletedPayloadSchema,
  TransactionListDeletedQuery,
  TransactionRestoreCommand,
  transactionRestorePayloadSchema,
  TransactionUpdateCommand,
  transactionUpdatePayloadSchema,
  type TransactionWriteResult,
} from "@domain/transactions"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the entry requests need from the app: the buses. */
export interface TransactionOperationDependencies {
  create(command: TransactionCreateCommand): Promise<TransactionWriteResult>
  update(command: TransactionUpdateCommand): Promise<{ transaction: Transaction }>
  delete(command: TransactionDeleteCommand): Promise<{ transaction: Transaction }>
  restore(command: TransactionRestoreCommand): Promise<{ transaction: Transaction }>
  get(query: TransactionGetQuery): Promise<{ transaction: Transaction }>
  listDeleted(query: TransactionListDeletedQuery): Promise<{ transactions: Transaction[] }>
  ledger(query: TransactionLedgerQuery): Promise<{ ledger: Ledger }>
}

/**
 * The entry commands and queries, listed once. The socket and `POST /api/call/<name>` both serve
 * this list, so an entry has no REST route. Each one parses its payload and dispatches on the bus;
 * who may do what is decided in the handlers.
 */
export function createTransactionOperations(
  dependencies: TransactionOperationDependencies,
): Operations<Actor> {
  return {
    "transaction.create": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransactionRequest(transactionCreatePayloadSchema, payload)
        return await dependencies.create(
          new TransactionCreateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transaction.update": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransactionRequest(transactionUpdatePayloadSchema, payload)
        return await dependencies.update(
          new TransactionUpdateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transaction.delete": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransactionRequest(transactionDeletePayloadSchema, payload)
        return await dependencies.delete(
          new TransactionDeleteCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transaction.restore": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseTransactionRequest(transactionRestorePayloadSchema, payload)
        return await dependencies.restore(
          new TransactionRestoreCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "transaction.get": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseTransactionRequest(transactionGetPayloadSchema, payload)
        return await dependencies.get(new TransactionGetQuery({ actor, ...input }))
      },
    },
    "transaction.listDeleted": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseTransactionRequest(transactionListDeletedPayloadSchema, payload)
        return await dependencies.listDeleted(new TransactionListDeletedQuery({ actor, ...input }))
      },
    },
    "transaction.ledger": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseTransactionRequest(transactionLedgerPayloadSchema, payload)
        return await dependencies.ledger(new TransactionLedgerQuery({ actor, ...input }))
      },
    },
  }
}
