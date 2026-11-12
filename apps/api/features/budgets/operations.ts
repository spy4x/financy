import {
  type Budget,
  type BudgetMonth,
  budgetMonthPayloadSchema,
  BudgetMonthQuery,
  BudgetSetCommand,
  budgetSetPayloadSchema,
  parseBudgetRequest,
} from "@domain/budgets"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the budget requests need from the app: the buses. */
export interface BudgetOperationDependencies {
  set(command: BudgetSetCommand): Promise<{ budget: Budget }>
  month(query: BudgetMonthQuery): Promise<{ budgets: BudgetMonth }>
}

/**
 * The budget command and query, listed once. The socket and `POST /api/call/<name>` both serve
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
    "budget.month": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseBudgetRequest(budgetMonthPayloadSchema, payload)
        return await dependencies.month(new BudgetMonthQuery({ actor, ...input }))
      },
    },
  }
}
