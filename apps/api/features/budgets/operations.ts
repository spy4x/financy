import {
  type Budget,
  BudgetMethodSetCommand,
  budgetMethodSetPayloadSchema,
  type BudgetMethodSetting,
  type BudgetMonth,
  budgetMonthPayloadSchema,
  BudgetMonthQuery,
  type BudgetMove,
  BudgetMoveCommand,
  budgetMovePayloadSchema,
  BudgetSetCommand,
  budgetSetPayloadSchema,
  parseBudgetRequest,
} from "@domain/budgets"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the budget requests need from the app: the buses. */
export interface BudgetOperationDependencies {
  set(command: BudgetSetCommand): Promise<{ budget: Budget }>
  setMethod(command: BudgetMethodSetCommand): Promise<{ method: BudgetMethodSetting }>
  move(command: BudgetMoveCommand): Promise<{ move: BudgetMove }>
  month(query: BudgetMonthQuery): Promise<{ budgets: BudgetMonth }>
}

/**
 * The budget commands and query, listed once. The socket and `POST /api/call/<name>` both serve
 * this list, so a budget has no REST route. Each one parses its payload and dispatches on the bus;
 * who may do what is decided in the handlers.
 */
export function createBudgetOperations(
  dependencies: BudgetOperationDependencies,
): Operations<Actor> {
  return {
    "budget.set": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseBudgetRequest(budgetSetPayloadSchema, payload)
        return await dependencies.set(
          new BudgetSetCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "budget.method.set": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseBudgetRequest(budgetMethodSetPayloadSchema, payload)
        return await dependencies.setMethod(
          new BudgetMethodSetCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "budget.move": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseBudgetRequest(budgetMovePayloadSchema, payload)
        return await dependencies.move(
          new BudgetMoveCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "budget.month": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseBudgetRequest(budgetMonthPayloadSchema, payload)
        return await dependencies.month(new BudgetMonthQuery({ actor, ...input }))
      },
    },
  }
}
