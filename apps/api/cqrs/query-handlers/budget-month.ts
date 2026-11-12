import { BudgetMonthQuery } from "@domain/budgets"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createBudgetMonthHandler } from "../../features/budgets/handlers.ts"
import { budgetDependencies } from "../budget-dependencies.ts"

export const budgetMonthHandler: QueryHandler<BudgetMonthQuery> = createBudgetMonthHandler(
  budgetDependencies,
)
