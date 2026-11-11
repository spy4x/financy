import { CategoryGetQuery } from "@domain/categories"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createCategoryGetHandler } from "../../features/categories/handlers.ts"
import { categoryDependencies } from "../category-dependencies.ts"

export const categoryGetHandler: QueryHandler<CategoryGetQuery> = createCategoryGetHandler(
  categoryDependencies,
)
