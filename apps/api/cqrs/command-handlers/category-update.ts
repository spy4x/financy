import { CommandHandler } from "@shared/cqrs/types.ts"
import { CategoryUpdateCommand } from "@api/cqrs/commands.ts"
import { CategoryUpdatedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for updating a category
 */
export const CategoryUpdateHandler: CommandHandler<CategoryUpdateCommand> = async (command) => {
  const { categoryId, updates, userId, acknowledgmentId } = command.data

  console.log(`Updating category ${categoryId} for user ${userId}...`)

  try {
    // Find the existing category
    const existingCategory = await db.category.findOne({ id: categoryId })
    if (!existingCategory) {
      throw new Error("Category not found")
    }

    // Verify user has access to this category
    const hasAccess = await db.category.verifyLegitimacy({
      ...existingCategory,
      ...updates,
    }, userId)
    if (!hasAccess) {
      throw new Error("Access denied to this category")
    }

    // Update the category
    const category = await db.category.updateOne({
      id: categoryId,
      data: updates,
    })

    if (!category) {
      throw new Error("Failed to update category")
    }

    console.log(`✅ Category ${categoryId} updated successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new CategoryUpdatedEvent({
        category,
        userId,
        acknowledgmentId,
      }),
    )

    return { category }
  } catch (error) {
    console.error(`❌ Failed to update category ${categoryId} for user ${userId}:`, error)
    throw error
  }
}
