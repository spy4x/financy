import { CommandHandler } from "@shared/cqrs/types.ts"
import { CategoryUndeleteCommand } from "@api/cqrs/commands.ts"
import { CategoryUndeletedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for undeleting (restoring) a category
 */
export const CategoryUndeleteHandler: CommandHandler<CategoryUndeleteCommand> = async (command) => {
  const { categoryId, userId, acknowledgmentId } = command.data

  console.log(`Undeleting category ${categoryId} for user ${userId}...`)

  try {
    // Find the existing category (including deleted ones)
    const existingCategory = await db.category.findOne({ id: categoryId })
    if (!existingCategory) {
      throw new Error("Category not found")
    }

    // Verify user has access to this category
    const hasAccess = await db.category.verifyLegitimacy(existingCategory, userId)
    if (!hasAccess) {
      throw new Error("Access denied to this category")
    }

    // Undelete the category
    const category = await db.category.undeleteOne({ id: categoryId })

    if (!category) {
      throw new Error("Failed to undelete category")
    }

    console.log(`✅ Category ${categoryId} undeleted successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new CategoryUndeletedEvent({
        category,
        userId,
        acknowledgmentId,
      }),
    )

    return { category }
  } catch (error) {
    console.error(`❌ Failed to undelete category ${categoryId} for user ${userId}:`, error)
    throw error
  }
}
