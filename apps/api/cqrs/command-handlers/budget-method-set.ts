import { BudgetMethodSetCommand } from "@domain/budgets"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createBudgetMethodSetHandler } from "../../features/budgets/handlers.ts"
import { budgetDependencies } from "../budget-dependencies.ts"

export const budgetMethodSetHandler: CommandHandler<BudgetMethodSetCommand> =
  createBudgetMethodSetHandler(budgetDependencies)
