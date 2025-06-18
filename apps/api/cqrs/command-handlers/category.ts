import { CommandHandler } from "@shared/cqrs/types.ts"
import { CategoryCreateCommand, CategoryDeleteCommand, CategoryUpdateCommand } from "@shared/rpc"
import { CategoryCreatedEvent, CategoryDeletedEvent, CategoryUpdatedEvent } from "@shared/rpc"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for creating a category
 */
export const CategoryCreateHandler: CommandHandler<CategoryCreateCommand> = async (command) => {
  const { category: categoryData, acknowledgmentId } = command.data

  console.log(`Creating category "${categoryData.name}" for group ${categoryData.groupId}...`)

  // Verify legitimacy before creating
  const isLegitimate = await db.category.verifyLegitimacy(categoryData, categoryData.groupId)
  if (!isLegitimate) {
    throw new Error("Category is not legitimate")
  }

  const category = await db.category.createOne({ data: categoryData })

  // Emit event for WebSocket notifications and other side effects
  eventBus.emit(
    new CategoryCreatedEvent({
      category,
      acknowledgmentId,
    }),
  )

  return { category }
}

/**
 * Handler for updating a category
 */
export const CategoryUpdateHandler: CommandHandler<CategoryUpdateCommand> = async (command) => {
  const { id, category: categoryUpdate, acknowledgmentId } = command.data

  console.log(`Updating category ${id}...`)

  // Get the existing category to verify legitimacy
  const existingCategory = await db.category.findOne({ id })
  if (!existingCategory) {
    throw new Error("Category not found")
  }

  // Verify legitimacy before updating
  const updatedData = { ...existingCategory, ...categoryUpdate }
  const isLegitimate = await db.category.verifyLegitimacy(updatedData, existingCategory.groupId)
  if (!isLegitimate) {
    throw new Error("Category is not legitimate")
  }

  const category = await db.category.updateOne({
    id,
    data: categoryUpdate,
  })

  // Emit event for WebSocket notifications and other side effects
  eventBus.emit(
    new CategoryUpdatedEvent({
      category,
      acknowledgmentId,
    }),
  )

  return { category }
}

/**
 * Handler for deleting a category
 */
export const CategoryDeleteHandler: CommandHandler<CategoryDeleteCommand> = async (command) => {
  const { id, userId, acknowledgmentId } = command.data

  console.log(`Deleting category ${id}...`)

  // Verify legitimacy before deleting
  const isLegitimate = await db.category.verifyLegitimacyById(id, userId)
  if (!isLegitimate) {
    throw new Error("Category is not legitimate")
  }

  const category = await db.category.deleteOne({ id })

  // Emit event for WebSocket notifications and other side effects
  eventBus.emit(
    new CategoryDeletedEvent({
      category,
      acknowledgmentId,
    }),
  )

  return { category }
}
