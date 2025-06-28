import { CommandHandler } from "@shared/cqrs/types.ts"
import { UserUpdateCommand } from "@api/cqrs/commands.ts"
import { UserUpdatedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for updating a user
 */
export const UserUpdateHandler: CommandHandler<UserUpdateCommand> = async (command) => {
  const { userId, updates, acknowledgmentId } = command.data

  console.log(`Updating user ${userId}...`)

  try {
    // Update the user
    const user = await db.user.updateOne({
      id: userId,
      data: updates,
    })

    if (!user) {
      throw new Error("Failed to update user")
    }

    console.log(`✅ User ${userId} updated successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new UserUpdatedEvent({
        user,
        acknowledgmentId,
      }),
    )

    return { user }
  } catch (error) {
    console.error(`❌ Failed to update user ${userId}:`, error)
    throw error
  }
}
