import { CategoryListQuery } from "@domain/categories"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createCategoryListHandler } from "../../features/categories/handlers.ts"
import { categoryDependencies } from "../category-dependencies.ts"

export const categoryListHandler: QueryHandler<CategoryListQuery> = createCategoryListHandler(
  categoryDependencies,
)
