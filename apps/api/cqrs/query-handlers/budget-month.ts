import type { BudgetMonthQuery, BudgetWidgetQuery } from "@domain/budgets"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import {
  createBudgetMonthHandler,
  createBudgetWidgetHandler,
} from "../../features/budgets/handlers.ts"
import { budgetDependencies } from "../budget-dependencies.ts"
import { db } from "../../services/db.ts"

export const budgetMonthHandler: QueryHandler<BudgetMonthQuery> = createBudgetMonthHandler(
  budgetDependencies,
)

/** The overview's budgets widget reads the month through the same handler, and the names. */
export const budgetWidgetHandler: QueryHandler<BudgetWidgetQuery> = createBudgetWidgetHandler({
  ...budgetDependencies,
  categories: db.category,
})
