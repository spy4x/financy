import { CommandHandler } from "@shared/cqrs/types.ts"
import { CategoryCreateCommand } from "@api/cqrs/commands.ts"
import { CategoryCreatedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for creating a category
 */
export const CategoryCreateHandler: CommandHandler<CategoryCreateCommand> = async (command) => {
  const { category: categoryData, userId, acknowledgmentId } = command.data

  console.log(`Creating category "${categoryData.name}" for user ${userId}...`)

  try {
    // Verify user has access to the specified group
    const hasAccess = await db.category.verifyLegitimacy(categoryData, userId)
    if (!hasAccess) {
      throw new Error("Access denied to specified group")
    }

    // Create the category
    const category = await db.category.createOne({ data: categoryData })

    if (!category) {
      throw new Error("Failed to create category")
    }

    console.log(`✅ Category "${category.name}" created successfully (ID: ${category.id})`)

    // Emit event for real-time updates
    eventBus.emit(
      new CategoryCreatedEvent({
        category,
        userId,
        acknowledgmentId,
      }),
    )

    return { category }
  } catch (error) {
    console.error(`❌ Failed to create category "${categoryData.name}" for user ${userId}:`, error)
    throw error
  }
}
