import { BudgetMoveCommand } from "@domain/budgets"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createBudgetMoveHandler } from "../../features/budgets/handlers.ts"
import { budgetDependencies } from "../budget-dependencies.ts"

export const budgetMoveHandler: CommandHandler<BudgetMoveCommand> = createBudgetMoveHandler(
  budgetDependencies,
)
