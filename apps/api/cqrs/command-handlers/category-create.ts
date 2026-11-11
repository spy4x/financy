import { CategoryCreateCommand } from "@domain/categories"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createCategoryCreateHandler } from "../../features/categories/handlers.ts"
import { categoryDependencies } from "../category-dependencies.ts"

export const categoryCreateHandler: CommandHandler<CategoryCreateCommand> =
  createCategoryCreateHandler(
    categoryDependencies,
  )
