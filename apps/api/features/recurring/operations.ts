import {
  parseRecurringRuleRequest,
  type RecurringRule,
  RecurringRuleCreateCommand,
  recurringRuleCreatePayloadSchema,
  RecurringRuleDeleteCommand,
  recurringRuleDeletePayloadSchema,
  recurringRuleGetPayloadSchema,
  RecurringRuleGetQuery,
  recurringRuleListPayloadSchema,
  RecurringRuleListQuery,
  RecurringRuleRestoreCommand,
  recurringRuleRestorePayloadSchema,
  RecurringRuleSkipCommand,
  recurringRuleSkipPayloadSchema,
  RecurringRuleUpdateCommand,
  recurringRuleUpdatePayloadSchema,
  type RecurringRuleWriteResult,
} from "@domain/recurring"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the rule requests need from the app: the buses. */
export interface RecurringRuleOperationDependencies {
  create(command: RecurringRuleCreateCommand): Promise<RecurringRuleWriteResult>
  update(command: RecurringRuleUpdateCommand): Promise<{ rule: RecurringRule }>
  delete(command: RecurringRuleDeleteCommand): Promise<{ rule: RecurringRule }>
  restore(command: RecurringRuleRestoreCommand): Promise<{ rule: RecurringRule }>
  skip(command: RecurringRuleSkipCommand): Promise<{ rule: RecurringRule }>
  get(query: RecurringRuleGetQuery): Promise<{ rule: RecurringRule }>
  list(query: RecurringRuleListQuery): Promise<{ rules: RecurringRule[] }>
}

/**
 * The repeating rule commands and queries, listed once. The socket and `POST /api/call/<name>` both
 * serve this list. Each one parses its payload and dispatches on the bus; who may do what is
 * decided in the handlers.
 */
export function createRecurringRuleOperations(
  dependencies: RecurringRuleOperationDependencies,
): Operations<Actor> {
  return {
    "recurring.create": {
      kind: `command`,
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseRecurringRuleRequest(recurringRuleCreatePayloadSchema, payload)
        return await dependencies.create(
          new RecurringRuleCreateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "recurring.update": {
      kind: `command`,
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseRecurringRuleRequest(recurringRuleUpdatePayloadSchema, payload)
        return await dependencies.update(
          new RecurringRuleUpdateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "recurring.delete": {
      kind: `command`,
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseRecurringRuleRequest(recurringRuleDeletePayloadSchema, payload)
        return await dependencies.delete(
          new RecurringRuleDeleteCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "recurring.restore": {
      kind: `command`,
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseRecurringRuleRequest(recurringRuleRestorePayloadSchema, payload)
        return await dependencies.restore(
          new RecurringRuleRestoreCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "recurring.skip": {
      kind: `command`,
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseRecurringRuleRequest(recurringRuleSkipPayloadSchema, payload)
        return await dependencies.skip(
          new RecurringRuleSkipCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "recurring.get": {
      kind: `query`,
      handle: async ({ actor, payload }) => {
        const input = parseRecurringRuleRequest(recurringRuleGetPayloadSchema, payload)
        return await dependencies.get(new RecurringRuleGetQuery({ actor, ...input }))
      },
    },
    "recurring.list": {
      kind: `query`,
      handle: async ({ actor, payload }) => {
        const input = parseRecurringRuleRequest(recurringRuleListPayloadSchema, payload)
        return await dependencies.list(new RecurringRuleListQuery({ actor, ...input }))
      },
    },
  }
}
