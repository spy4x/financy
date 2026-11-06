import {
  type Account,
  AccountArchiveCommand,
  accountArchivePayloadSchema,
  AccountCreateCommand,
  accountCreatePayloadSchema,
  AccountDeleteCommand,
  accountDeletePayloadSchema,
  accountGetPayloadSchema,
  AccountGetQuery,
  accountListPayloadSchema,
  AccountListQuery,
  AccountRestoreCommand,
  accountRestorePayloadSchema,
  AccountSetDefaultCommand,
  accountSetDefaultPayloadSchema,
  AccountUpdateCommand,
  accountUpdatePayloadSchema,
  type AccountWriteResult,
  type ListedAccount,
  parseAccountRequest,
} from "@domain/accounts"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the account requests need from the app: the buses. */
export interface AccountOperationDependencies {
  create(command: AccountCreateCommand): Promise<AccountWriteResult>
  update(command: AccountUpdateCommand): Promise<{ account: Account }>
  archive(command: AccountArchiveCommand): Promise<{ account: Account }>
  setDefault(command: AccountSetDefaultCommand): Promise<{ account: Account }>
  delete(command: AccountDeleteCommand): Promise<{ account: Account }>
  restore(command: AccountRestoreCommand): Promise<{ account: Account }>
  get(query: AccountGetQuery): Promise<{ account: ListedAccount }>
  list(query: AccountListQuery): Promise<{ accounts: ListedAccount[] }>
}

/**
 * The account commands and queries, listed once. The socket and `POST /api/call/<name>` both serve
 * this list, so an account has no REST route per command. Each one parses its payload and
 * dispatches on the bus; who may do what is decided in the handlers.
 */
export function createAccountOperations(
  dependencies: AccountOperationDependencies,
): Operations<Actor> {
  return {
    "account.create": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseAccountRequest(accountCreatePayloadSchema, payload)
        return await dependencies.create(
          new AccountCreateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "account.update": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseAccountRequest(accountUpdatePayloadSchema, payload)
        return await dependencies.update(
          new AccountUpdateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "account.archive": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseAccountRequest(accountArchivePayloadSchema, payload)
        return await dependencies.archive(
          new AccountArchiveCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "account.setDefault": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseAccountRequest(accountSetDefaultPayloadSchema, payload)
        return await dependencies.setDefault(
          new AccountSetDefaultCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "account.delete": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseAccountRequest(accountDeletePayloadSchema, payload)
        return await dependencies.delete(
          new AccountDeleteCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "account.restore": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseAccountRequest(accountRestorePayloadSchema, payload)
        return await dependencies.restore(
          new AccountRestoreCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "account.get": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseAccountRequest(accountGetPayloadSchema, payload)
        return await dependencies.get(new AccountGetQuery({ actor, ...input }))
      },
    },
    "account.list": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseAccountRequest(accountListPayloadSchema, payload)
        return await dependencies.list(new AccountListQuery({ actor, ...input }))
      },
    },
  }
}
