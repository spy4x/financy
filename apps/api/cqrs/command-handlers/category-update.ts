import { CategoryUpdateCommand } from "@domain/categories"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createCategoryUpdateHandler } from "../../features/categories/handlers.ts"
import { categoryDependencies } from "../category-dependencies.ts"

export const categoryUpdateHandler: CommandHandler<CategoryUpdateCommand> =
  createCategoryUpdateHandler(
    categoryDependencies,
  )
