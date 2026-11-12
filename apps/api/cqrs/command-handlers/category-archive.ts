import { CategoryArchiveCommand } from "@domain/categories"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createCategoryArchiveHandler } from "../../features/categories/handlers.ts"
import { categoryDependencies } from "../category-dependencies.ts"

export const categoryArchiveHandler: CommandHandler<CategoryArchiveCommand> =
  createCategoryArchiveHandler(
    categoryDependencies,
  )
