import { BudgetSetCommand } from "@domain/budgets"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createBudgetSetHandler } from "../../features/budgets/handlers.ts"
import { budgetDependencies } from "../budget-dependencies.ts"

export const budgetSetHandler: CommandHandler<BudgetSetCommand> = createBudgetSetHandler(
  budgetDependencies,
)
