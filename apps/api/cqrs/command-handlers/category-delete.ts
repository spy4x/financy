import { CommandHandler } from "@shared/cqrs/types.ts"
import { CategoryDeleteCommand } from "@api/cqrs/commands.ts"
import { CategoryDeletedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for deleting a category
 */
export const CategoryDeleteHandler: CommandHandler<CategoryDeleteCommand> = async (command) => {
  const { categoryId, userId, acknowledgmentId } = command.data

  console.log(`Deleting category ${categoryId} for user ${userId}...`)

  try {
    // Verify user has access to this category
    const hasAccess = await db.category.verifyLegitimacyById(categoryId, userId)
    if (!hasAccess) {
      throw new Error("Access denied to this category")
    }

    // Delete the category
    const category = await db.category.deleteOne({ id: categoryId })

    if (!category) {
      throw new Error("Failed to delete category")
    }

    console.log(`✅ Category ${categoryId} deleted successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new CategoryDeletedEvent({
        category,
        userId,
        acknowledgmentId,
      }),
    )

    return { category }
  } catch (error) {
    console.error(`❌ Failed to delete category ${categoryId} for user ${userId}:`, error)
    throw error
  }
}
